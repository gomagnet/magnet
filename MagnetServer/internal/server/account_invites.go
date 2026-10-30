package server

import (
	"crypto/rand"
	"encoding/base32"
	"errors"
	"net/mail"
	"net/url"
	"strings"
	"time"

	protocol "MagnetShared/protocol"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type inviteProfile struct {
	Username string `json:"username"`
	Name     string `json:"name"`
	Email    string `json:"email"`
}

type inviteSettings struct {
	Enabled bool           `json:"enabled"`
	Viewer  bool           `json:"viewer"`
	Admin   bool           `json:"admin"`
	Groups  []string       `json:"groups"`
	Grants  []accountGrant `json:"grants"`
}

func validateInviteGroups(tx *sqlx.Tx, groups []string) error {
	if len(groups) > 100 {
		return errors.New("too many groups")
	}
	seen := map[string]bool{}
	for _, id := range groups {
		if seen[id] {
			return errors.New("duplicate group")
		}
		seen[id] = true
		var found string
		if tx.Get(&found, "SELECT id FROM account_groups WHERE id=?", id) != nil {
			return errors.New("group no longer exists; ask an administrator for a new invitation")
		}
	}
	return nil
}

// Invite bearers can only enroll with the administrator's saved settings. Enrollment never
// issues a browser session; the recipient saves recovery codes before sign-in.
func (a *app) inviteRoutes(r *gin.Engine) {
	r.Match([]string{"GET", "HEAD"}, "/invite", func(c *gin.Context) {
		c.Header("Referrer-Policy", "no-referrer")
		webAsset("invite.html", "text/html; charset=utf-8")(c)
	})
	r.Match([]string{"GET", "HEAD"}, "/invite.js", webAsset("invite.js", "application/javascript"))
	public := r.Group("/api/invite", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		if !a.sameOrigin(c) || c.GetHeader("X-Magnet-Request") != "1" {
			c.AbortWithStatus(403)
			return
		}
		if !a.allowSecurityAttempt("invite-ip:" + c.ClientIP()) {
			c.AbortWithStatus(429)
			return
		}
		c.Next()
	})
	public.POST("/enroll", a.enrollInvite)
	public.POST("/complete", a.completeInvite)
}

func (a *app) createAccountInvite(c *gin.Context) {
	settings := inviteSettings{Enabled: true}
	if c.ShouldBindJSON(&settings) != nil {
		bad(c, "invalid invitation settings")
		return
	}
	now := time.Now().Unix()
	if _, err := a.db.Exec("DELETE FROM account_invites WHERE expires<=?", now); err != nil {
		fail(c, 500, errors.New("cannot clear expired invitations"))
		return
	}
	token := protocol.Secret()
	expires := time.Now().Add(3 * time.Hour).Unix()
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, errors.New("cannot create invitation"))
		return
	}
	defer tx.Rollback()
	if err = validateInviteGroups(tx, settings.Groups); err != nil {
		bad(c, err.Error())
		return
	}
	if err = validateAccountGrants(tx, settings.Grants); err != nil {
		bad(c, err.Error())
		return
	}
	raw, err := a.protect("invite-settings:"+hash(token), settings)
	if err != nil {
		fail(c, 500, errors.New("cannot save invitation settings"))
		return
	}
	if _, err = tx.Exec("INSERT INTO account_invites(digest,expires,settings) VALUES(?,?,?)", hash(token), expires, raw); err != nil {
		fail(c, 500, errors.New("cannot create invitation"))
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, errors.New("cannot create invitation"))
		return
	}
	a.event("", "User invitation created (expires in three hours)")
	// The fragment keeps the bearer credential out of HTTP URLs and access logs.
	c.JSON(200, gin.H{"path": "/invite#" + token, "expires": expires})
}

func (a *app) enrollInvite(c *gin.Context) {
	var in struct {
		Token string `json:"token"`
		inviteProfile
	}
	if c.ShouldBindJSON(&in) != nil || len(in.Token) != 43 {
		bad(c, "invalid invitation")
		return
	}
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.TrimSpace(in.Email)
	if !accountUsername.MatchString(in.Username) || (in.Username == "root" || in.Username == "admin") || in.Name == "" || len(in.Name) > 200 || len(in.Email) > 255 || !validInviteEmail(in.Email) {
		bad(c, "enter a valid username, display name and email")
		return
	}
	var expires int64
	if a.db.Get(&expires, "SELECT expires FROM account_invites WHERE digest=? AND expires>?", hash(in.Token), time.Now().Unix()) != nil {
		bad(c, "invitation expired or already used")
		return
	}
	if !a.allowSecurityAttempt("invite:" + hash(in.Token)) {
		c.AbortWithStatus(429)
		return
	}
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		fail(c, 500, err)
		return
	}
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
	enrollment := protocol.Secret()
	// Use a dedicated payload so the secret is encrypted, never returned as part
	// of an account profile or accidentally omitted by its JSON field tags.
	raw, err := a.protect("invite:"+hash(enrollment), struct {
		Profile inviteProfile
		Secret  string
	}{in.inviteProfile, secret})
	if err != nil {
		fail(c, 500, err)
		return
	}
	deadline := min(expires, time.Now().Add(10*time.Minute).Unix())
	if _, err = a.db.Exec("DELETE FROM account_invite_enrollments WHERE expires<=?", time.Now().Unix()); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = a.db.Exec("INSERT INTO account_invite_enrollments(digest,invite_digest,payload,expires) VALUES(?,?,?,?)", hash(enrollment), hash(in.Token), raw, deadline); err != nil {
		bad(c, "invitation unavailable; request a new link")
		return
	}
	uri := url.URL{Scheme: "otpauth", Host: "totp", Path: "/Magnet:" + in.Username}
	q := uri.Query()
	q.Set("issuer", "Magnet")
	q.Set("secret", secret)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	uri.RawQuery = q.Encode()
	c.JSON(200, gin.H{"enrollment": enrollment, "secret": secret, "uri": uri.String(), "expires": deadline})
}

func (a *app) completeInvite(c *gin.Context) {
	var in struct {
		Token      string `json:"token"`
		Enrollment string `json:"enrollment"`
		Code       string `json:"code"`
	}
	if c.ShouldBindJSON(&in) != nil || len(in.Token) != 43 || len(in.Enrollment) != 43 {
		bad(c, "invalid enrollment")
		return
	}
	if !a.allowSecurityAttempt("invite:" + hash(in.Token)) {
		c.AbortWithStatus(429)
		return
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, errors.New("account enrollment unavailable"))
		return
	}
	defer tx.Rollback()
	var invitation struct {
		Expires  int64  `db:"expires"`
		Settings string `db:"settings"`
	}
	if tx.Get(&invitation, "SELECT expires,settings FROM account_invites WHERE digest=? FOR UPDATE", hash(in.Token)) != nil || invitation.Expires <= time.Now().Unix() {
		bad(c, "invitation expired or already used")
		return
	}
	// Existing links created before settings were supported retain their original
	// enabled, unprivileged behavior. Public request fields never supply access.
	settings := inviteSettings{Enabled: true}
	if invitation.Settings != "" && a.unprotect("invite-settings:"+hash(in.Token), invitation.Settings, &settings) != nil {
		fail(c, 500, errors.New("invitation settings unavailable"))
		return
	}
	if err = validateInviteGroups(tx, settings.Groups); err != nil {
		bad(c, err.Error())
		return
	}
	var raw string
	if tx.Get(&raw, "SELECT payload FROM account_invite_enrollments WHERE digest=? AND invite_digest=? AND expires>?", hash(in.Enrollment), hash(in.Token), time.Now().Unix()) != nil {
		bad(c, "enrollment expired; restart from your invitation")
		return
	}
	var draft struct {
		Profile inviteProfile
		Secret  string
	}
	if a.unprotect("invite:"+hash(in.Enrollment), raw, &draft) != nil {
		fail(c, 500, errors.New("account enrollment unavailable"))
		return
	}
	step, valid := totpStep(draft.Secret, strings.TrimSpace(in.Code), 0)
	if !valid {
		bad(c, "invalid authenticator code")
		return
	}
	id := protocol.Secret()
	security := securityState{Secret: draft.Secret, LastStep: step}
	codes := []string{}
	for range 8 {
		code := protocol.Secret()[:20]
		codes = append(codes, code)
		security.Recovery = append(security.Recovery, hash(code))
	}
	raw, err = a.protect("account-totp:"+id, security)
	if err != nil {
		fail(c, 500, err)
		return
	}
	p := draft.Profile
	if !accountUsername.MatchString(p.Username) || p.Username == "admin" || p.Username == "root" {
		bad(c, "username is reserved; restart invitation enrollment")
		return
	}
	if _, err = tx.Exec("INSERT INTO account_users(id,username,name,email,password_hash,enabled,admin,viewer,security,created,totp_only) VALUES(?,?,?,?,'',?,?,?,?,?,1)", id, p.Username, p.Name, p.Email, settings.Enabled, settings.Admin, settings.Viewer, raw, time.Now().Unix()); err != nil {
		bad(c, "cannot create account; username may already exist. Restart enrollment with another username")
		return
	}
	for _, group := range settings.Groups {
		if _, err = tx.Exec("INSERT INTO account_memberships(user_id,group_id,source) VALUES(?,?,'')", id, group); err != nil {
			bad(c, "cannot apply invitation groups; ask an administrator for a new invitation")
			return
		}
	}
	if err = saveAccountGrants(tx, "user_id", id, settings.Grants); err != nil {
		bad(c, "cannot apply invitation access; ask an administrator for a new invitation")
		return
	}
	result, err := tx.Exec("DELETE FROM account_invites WHERE digest=? AND expires>?", hash(in.Token), time.Now().Unix())
	if err != nil {
		fail(c, 500, errors.New("cannot consume invitation"))
		return
	}
	if n, err := result.RowsAffected(); err != nil || n != 1 {
		bad(c, "invitation expired or already used")
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, errors.New("cannot complete enrollment"))
		return
	}
	a.event("", "Invited user registered: "+p.Username)
	c.JSON(200, gin.H{"recovery_codes": codes})
}

func validInviteEmail(value string) bool {
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value
}
