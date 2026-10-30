package server

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

type accountGrant struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Level string `json:"level"`
}
type accountUser struct {
	ID              string         `db:"id" json:"id"`
	Username        string         `db:"username" json:"username"`
	Name            string         `db:"name" json:"name"`
	Email           string         `db:"email" json:"email"`
	Enabled         bool           `db:"enabled" json:"enabled"`
	Viewer          bool           `db:"viewer" json:"viewer"`
	Admin           bool           `db:"admin" json:"admin"`
	TOTPOnly        bool           `db:"totp_only" json:"totp_only"`
	HasPassword     bool           `db:"has_password" json:"has_password"`
	Groups          []string       `db:"-" json:"groups"`
	AutomaticGroups []string       `db:"-" json:"automatic_groups"`
	Grants          []accountGrant `db:"-" json:"grants"`
}
type accountGroup struct {
	ID     string         `db:"id" json:"id"`
	Name   string         `db:"name" json:"name"`
	Viewer bool           `db:"viewer" json:"viewer"`
	Admin  bool           `db:"admin" json:"admin"`
	Grants []accountGrant `db:"-" json:"grants"`
}

var accountUsername = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,119}$`)

func (a *app) accountRoutes(api *gin.RouterGroup) {
	admin := api.Group("/access", func(c *gin.Context) {
		if p := currentPrincipal(c); p == nil || !p.Admin {
			fail(c, 403, errors.New("workspace administrator access required"))
			return
		}
		c.Next()
	})
	admin.GET("/users", a.accountUsers)
	admin.POST("/users", a.createAccountInvite)
	admin.PUT("/users/:user", a.saveAccountUser)
	admin.DELETE("/users/:user", a.deleteAccountUser)
	admin.GET("/groups", a.accountGroups)
	admin.POST("/groups", a.saveAccountGroup)
	admin.PUT("/groups/:group", a.saveAccountGroup)
	admin.DELETE("/groups/:group", a.deleteAccountGroup)
	admin.GET("/providers", a.loginProviders)
	admin.POST("/providers", a.saveLoginProvider)
	admin.PUT("/providers/:provider", a.saveLoginProvider)
	admin.DELETE("/providers/:provider", a.deleteLoginProvider)
	api.POST("/account/password", a.changeAccountPassword)
}
func (a *app) accountGrants(column, id string) ([]accountGrant, error) {
	var rows []struct {
		Node  *string `db:"node_id"`
		Page  *string `db:"page_id"`
		Level string  `db:"level"`
	}
	out := []accountGrant{}
	if err := a.db.Select(&rows, "SELECT node_id,page_id,level FROM account_grants WHERE "+column+"=?", id); err != nil {
		return nil, err
	}
	for _, row := range rows {
		g := accountGrant{Level: row.Level}
		if row.Node != nil {
			g.Kind = "server"
			g.ID = *row.Node
		} else if row.Page != nil {
			g.Kind = "monitoring"
			g.ID = *row.Page
		}
		out = append(out, g)
	}
	var groups []struct {
		ID    string `db:"server_group_id"`
		Level string `db:"level"`
	}
	if err := a.db.Select(&groups, "SELECT server_group_id,level FROM server_group_grants WHERE "+column+"=?", id); err != nil {
		return nil, err
	}
	for _, group := range groups {
		out = append(out, accountGrant{Kind: "server_group", ID: group.ID, Level: group.Level})
	}
	return out, nil
}
func validateAccountGrants(tx *sqlx.Tx, grants []accountGrant) error {
	if len(grants) > 1000 {
		return errors.New("too many grants")
	}
	seen := map[string]bool{}
	for _, g := range grants {
		if (g.Kind != "server" && g.Kind != "monitoring" && g.Kind != "server_group") || (g.Level != "view" && g.Level != "manage") || seen[g.Kind+":"+g.ID] {
			return errors.New("select distinct resources and View or Manage access")
		}
		seen[g.Kind+":"+g.ID] = true
		table := "nodes"
		if g.Kind == "monitoring" {
			table = "status_pages"
		}
		if g.Kind == "server_group" {
			table = "server_groups"
		}
		var found string
		if err := tx.Get(&found, "SELECT id FROM "+table+" WHERE id=?", g.ID); err != nil {
			return errors.New("granted resource no longer exists")
		}
	}
	return nil
}
func saveAccountGrants(tx *sqlx.Tx, column, id string, grants []accountGrant) error {
	if err := validateAccountGrants(tx, grants); err != nil {
		return err
	}
	affected := map[string]bool{}
	var existing []string
	if err := tx.Select(&existing, "SELECT server_group_id FROM server_group_grants WHERE "+column+"=?", id); err != nil {
		return err
	}
	for _, group := range existing {
		affected[group] = true
	}
	for _, grant := range grants {
		if grant.Kind == "server_group" {
			affected[grant.ID] = true
		}
	}
	for group := range affected {
		if _, err := tx.Exec("UPDATE server_groups SET revision=revision+1 WHERE id=?", group); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("DELETE FROM server_group_grants WHERE "+column+"=?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM account_grants WHERE "+column+"=?", id); err != nil {
		return err
	}
	for _, g := range grants {
		if g.Kind == "server_group" {
			if _, err := tx.Exec("INSERT INTO server_group_grants(id,"+column+",server_group_id,level) VALUES(?,?,?,?)", protocol.Secret(), id, g.ID, g.Level); err != nil {
				return err
			}
			continue
		}
		resource := "node_id"
		if g.Kind == "monitoring" {
			resource = "page_id"
		}
		if _, err := tx.Exec("INSERT INTO account_grants(id,"+column+","+resource+",level) VALUES(?,?,?,?)", protocol.Secret(), id, g.ID, g.Level); err != nil {
			return err
		}
	}
	return nil
}
func (a *app) accountUsers(c *gin.Context) {
	users := []accountUser{}
	if err := a.db.Select(&users, "SELECT id,username,name,email,enabled,admin,viewer,totp_only,(password_hash<>'') AS has_password FROM account_users ORDER BY username"); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range users {
		u := &users[i]
		u.Groups = []string{}
		u.AutomaticGroups = []string{}
		if err := a.db.Select(&u.Groups, "SELECT group_id FROM account_memberships WHERE user_id=? AND source='' ORDER BY group_id", u.ID); err != nil {
			fail(c, 500, err)
			return
		}
		if err := a.db.Select(&u.AutomaticGroups, "SELECT DISTINCT m.group_id FROM account_memberships m WHERE m.user_id=? AND m.source<>'' AND "+effectiveMembership, u.ID); err != nil {
			fail(c, 500, err)
			return
		}
		var err error
		u.Grants, err = a.accountGrants("user_id", u.ID)
		if err != nil {
			fail(c, 500, err)
			return
		}
	}
	c.JSON(200, users)
}
func (a *app) saveAccountUser(c *gin.Context) {
	var in struct {
		accountUser
		Password           string `json:"password"`
		ResetAuthenticator bool   `json:"reset_authenticator"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid user")
		return
	}
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	in.Name = strings.TrimSpace(in.Name)
	if !accountUsername.MatchString(in.Username) || (in.Username == "root" || in.Username == "admin") || in.Name == "" || len(in.Name) > 200 || len(in.Email) > 255 || len(in.Groups) > 100 {
		bad(c, "valid username, display name and groups required")
		return
	}
	password := ""
	if in.Password != "" {
		if len(in.Password) < 12 || len(in.Password) > 72 {
			bad(c, "password must be 12–72 bytes")
			return
		}
		b, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
		if err != nil {
			fail(c, 500, err)
			return
		}
		password = string(b)
	}
	id := c.Param("user")
	if id == "" {
		bad(c, "create an invitation for new users")
		return
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	var only bool
	if tx.Get(&only, "SELECT totp_only FROM account_users WHERE id=? FOR UPDATE", id) != nil {
		fail(c, 404, errors.New("user not found"))
		return
	}
	if only && (in.ResetAuthenticator || in.Password != "") {
		bad(c, "invited accounts require their authenticator; use a recovery code or a new invitation")
		return
	}
	_, err = tx.Exec("UPDATE account_users SET username=?,name=?,email=?,enabled=?,admin=?,viewer=?,password_hash=IF(?='',password_hash,?),revision=revision+1 WHERE id=?", in.Username, in.Name, in.Email, in.Enabled, in.Admin, in.Viewer, password, password, id)
	if err != nil {
		fail(c, 400, errors.New("cannot save user; username may already exist"))
		return
	}
	if in.ResetAuthenticator {
		if _, err = tx.Exec("UPDATE account_users SET security='' WHERE id=?", id); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if _, err = tx.Exec("DELETE FROM account_memberships WHERE user_id=? AND source=''", id); err != nil {
		fail(c, 500, err)
		return
	}
	seen := map[string]bool{}
	for _, group := range in.Groups {
		if seen[group] {
			bad(c, "duplicate group")
			return
		}
		seen[group] = true
		if _, err = tx.Exec("INSERT INTO account_memberships(user_id,group_id,source) VALUES(?,?,'')", id, group); err != nil {
			bad(c, "group no longer exists")
			return
		}
	}
	if err = saveAccountGrants(tx, "user_id", id, in.Grants); err != nil {
		bad(c, err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.bumpAccountSession(c, id)
	a.revokeAccountSessions(c, id)
	a.event("", "User account saved: "+in.Username)
	c.JSON(200, gin.H{"id": id})
}
func (a *app) deleteAccountUser(c *gin.Context) {
	if currentPrincipal(c).ID == c.Param("user") {
		bad(c, "cannot delete your current account")
		return
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM account_users WHERE id=?", c.Param("user")); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec("DELETE FROM account_avatars WHERE owner=?", c.Param("user")); err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c, c.Param("user"))
	a.event("", "User account deleted")
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) accountGroups(c *gin.Context) {
	groups := []accountGroup{}
	if err := a.db.Select(&groups, "SELECT * FROM account_groups ORDER BY name"); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range groups {
		var err error
		groups[i].Grants, err = a.accountGrants("group_id", groups[i].ID)
		if err != nil {
			fail(c, 500, err)
			return
		}
	}
	c.JSON(200, groups)
}
func (a *app) saveAccountGroup(c *gin.Context) {
	var in accountGroup
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 {
		bad(c, "group name required")
		return
	}
	id := c.Param("group")
	creating := id == ""
	if creating {
		id = protocol.Secret()
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	if creating {
		_, err = tx.Exec("INSERT INTO account_groups(id,name,admin,viewer) VALUES(?,?,?,?)", id, in.Name, in.Admin, in.Viewer)
	} else {
		var found string
		if tx.Get(&found, "SELECT id FROM account_groups WHERE id=? FOR UPDATE", id) != nil {
			fail(c, 404, errors.New("group not found"))
			return
		}
		_, err = tx.Exec("UPDATE account_groups SET name=?,admin=?,viewer=? WHERE id=?", in.Name, in.Admin, in.Viewer, id)
	}
	if err != nil {
		bad(c, "cannot save group; name may already exist")
		return
	}
	if err = saveAccountGrants(tx, "group_id", id, in.Grants); err != nil {
		bad(c, err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "User group saved: "+in.Name)
	c.JSON(200, gin.H{"id": id})
}
func (a *app) deleteAccountGroup(c *gin.Context) {
	if _, err := a.db.Exec("DELETE FROM account_groups WHERE id=?", c.Param("group")); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "User group deleted")
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) changeAccountPassword(c *gin.Context) {
	p := currentPrincipal(c)
	if p.Root {
		bad(c, "rotate the recovery administrator key on the server")
		return
	}
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&in) != nil || len(in.Password) < 12 || len(in.Password) > 72 {
		bad(c, "new password must be 12–72 bytes")
		return
	}
	var stored string
	if a.db.Get(&stored, "SELECT password_hash FROM account_users WHERE id=?", p.ID) != nil || stored == "" || bcrypt.CompareHashAndPassword([]byte(stored), []byte(in.Current)) != nil {
		bad(c, "current local password is incorrect")
		return
	}
	b, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		fail(c, 500, err)
		return
	}
	result, err := a.db.Exec("UPDATE account_users SET password_hash=?,revision=revision+1 WHERE id=? AND password_hash=?", string(b), p.ID, stored)
	if err != nil {
		fail(c, 500, err)
		return
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		bad(c, "password changed concurrently")
		return
	}
	a.bumpAccountSession(c, p.ID)
	a.revokeAccountSessions(c, p.ID)
	c.JSON(200, gin.H{"ok": true})
}

// Keep the fixed-cost bcrypt path even when a username does not exist.
var dummyAccountHash = []byte("$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW")

func (a *app) loginAccount(c *gin.Context, username, password, code string) {
	var row struct {
		ID       string `db:"id"`
		Password string `db:"password_hash"`
		Enabled  bool   `db:"enabled"`
		Revision int64  `db:"revision"`
		TOTPOnly bool   `db:"totp_only"`
	}
	err := a.db.Get(&row, "SELECT id,password_hash,enabled,revision,totp_only FROM account_users WHERE username=?", strings.ToLower(strings.TrimSpace(username)))
	stored := []byte(row.Password)
	if err != nil || len(stored) == 0 {
		stored = dummyAccountHash
	}
	valid := bcrypt.CompareHashAndPassword(stored, []byte(password)) == nil
	if err != nil || !row.Enabled || (!row.TOTPOnly && (row.Password == "" || !valid)) {
		fail(c, 401, errors.New("invalid username or password"))
		return
	}
	enabled, err := a.userTOTPEnabled(row.ID)
	if err != nil {
		fail(c, 500, errors.New("account security unavailable"))
		return
	}
	if row.TOTPOnly && !enabled {
		fail(c, 401, errors.New("account authenticator unavailable; contact an administrator"))
		return
	}
	if enabled {
		if !a.allowSecurityAttempt("login-account:" + row.ID) {
			c.AbortWithStatus(429)
			return
		}
		if code == "" {
			c.AbortWithStatusJSON(400, gin.H{"error": "Enter an authenticator or recovery code", "code": "totp_required"})
			return
		}
		if err = a.verifyUserCode(row.ID, code); err != nil {
			bad(c, err.Error())
			return
		}
	}
	a.issueAccountSession(c, sessionIdentity{User: row.ID, UserRevision: row.Revision}, enabled)
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) issueAccountSession(c *gin.Context, identity sessionIdentity, elevated bool) {
	if identity.Authenticated == 0 {
		identity.Authenticated = time.Now().Unix()
	}
	token := protocol.Secret()
	now := time.Now()
	expiry := now.Add(12 * time.Hour)
	if identity.PendingMFA {
		expiry = now.Add(5 * time.Minute)
	}
	a.mu.Lock()
	if a.sessionUsers == nil {
		a.sessionUsers = map[string]sessionIdentity{}
	}
	for key, t := range a.sessions {
		if now.After(t) {
			delete(a.sessions, key)
			delete(a.sessionUsers, key)
			delete(a.elevated, key)
		}
	}
	a.sessions[hash(token)] = expiry
	a.sessionUsers[hash(token)] = identity
	a.mu.Unlock()
	if elevated {
		a.grantStepUp(token)
	}
	a.setSessionCookie(c, token)
}
func (a *app) setSessionCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("magnet_session", token, 43200, "/", "", a.cfg.TLSCert != "" || strings.HasPrefix(a.cfg.PublicURL, "https://"), true)
}
