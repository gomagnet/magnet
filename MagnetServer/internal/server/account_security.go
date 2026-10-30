package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base32"
	"errors"
	"net/url"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func (a *app) userTOTPEnabled(id string) (bool, error) {
	var raw string
	err := a.db.Get(&raw, "SELECT security FROM account_users WHERE id=? AND enabled=1", id)
	return raw != "", err
}
func (a *app) userLoginSecurity(id string) (bool, int64, error) {
	var row struct {
		Enabled  bool  `db:"mfa"`
		Revision int64 `db:"revision"`
	}
	err := a.db.Get(&row, "SELECT (security<>'') AS mfa,revision FROM account_users WHERE id=? AND enabled=1", id)
	return row.Enabled, row.Revision, err
}
func (a *app) accountTOTPEnabled(c *gin.Context) bool {
	p := currentPrincipal(c)
	if p == nil || p.Root {
		return a.totpEnabled()
	}
	enabled, err := a.userTOTPEnabled(p.ID)
	return enabled && err == nil
}
func verifyAccountSecurity(state *securityState, code string) error {
	code = strings.TrimSpace(code)
	if step, ok := totpStep(state.Secret, code, state.LastStep); ok {
		state.LastStep = step
		return nil
	}
	digest := hash(code)
	for i, h := range state.Recovery {
		if subtle.ConstantTimeCompare([]byte(h), []byte(digest)) == 1 {
			state.Recovery = append(state.Recovery[:i], state.Recovery[i+1:]...)
			return nil
		}
	}
	return errors.New("invalid or already used code")
}
func (a *app) verifyUserCode(id, code string) error { return a.mutateUserCode(id, code, false) }
func (a *app) mutateUserCode(id, code string, disable bool) error {
	tx, err := a.db.Beginx()
	if err != nil {
		return errors.New("account security unavailable")
	}
	defer tx.Rollback()
	var row struct {
		Security string `db:"security"`
		TOTPOnly bool   `db:"totp_only"`
	}
	if tx.Get(&row, "SELECT security,totp_only FROM account_users WHERE id=? AND enabled=1 FOR UPDATE", id) != nil || row.Security == "" {
		return errors.New("authenticator is not enabled")
	}
	if disable && row.TOTPOnly {
		return errors.New("invited accounts must keep authenticator protection enabled")
	}
	var state securityState
	if a.unprotect("account-totp:"+id, row.Security, &state) != nil {
		return errors.New("account security unavailable")
	}
	if err = verifyAccountSecurity(&state, code); err != nil {
		return err
	}
	encoded := ""
	if !disable {
		encoded, err = a.protect("account-totp:"+id, state)
		if err != nil {
			return err
		}
	}
	increment := 0
	if disable {
		increment = 1
	}
	if _, err = tx.Exec("UPDATE account_users SET security=?,revision=revision+? WHERE id=?", encoded, increment, id); err != nil {
		return err
	}
	return tx.Commit()
}

// The recovery administrator retains the existing file-backed security routes.
// Normal users operate exclusively on their own encrypted account security.
func (a *app) personalSecurity(c *gin.Context) {
	p := currentPrincipal(c)
	path := strings.TrimPrefix(c.Request.URL.Path, "/api/security")
	token, _ := c.Cookie("magnet_session")
	owner := hash(token)
	if c.Request.Method == "GET" && path == "" {
		enabled, err := a.userTOTPEnabled(p.ID)
		if err != nil {
			fail(c, 500, errors.New("account security unavailable"))
			return
		}
		c.JSON(200, gin.H{"enabled": enabled})
		return
	}
	if c.Request.Method != "POST" {
		c.AbortWithStatus(404)
		return
	}
	if path == "/check" {
		if a.stepUp(c) {
			c.JSON(200, gin.H{"ok": true})
		}
		return
	}
	var in struct {
		Key  string `json:"key"`
		Code string `json:"code"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid security request")
		return
	}
	if !a.allowSecurityAttempt(p.ID + ":" + c.ClientIP()) {
		c.AbortWithStatus(429)
		return
	}
	switch path {
	case "/enroll":
		enabled, err := a.userTOTPEnabled(p.ID)
		if err != nil || enabled {
			bad(c, "authenticator already enabled or account unavailable")
			return
		}
		var password string
		if a.db.Get(&password, "SELECT password_hash FROM account_users WHERE id=?", p.ID) != nil {
			bad(c, "account unavailable")
			return
		}
		if password != "" {
			if bcrypt.CompareHashAndPassword([]byte(password), []byte(in.Key)) != nil {
				bad(c, "invalid current password")
				return
			}
		} else {
			a.mu.Lock()
			identity := a.sessionUsers[owner]
			a.mu.Unlock()
			if identity.Provider == "" || time.Now().Unix()-identity.Authenticated > 300 {
				bad(c, "sign in again with your OpenID provider before enrolling an authenticator")
				return
			}
		}
		b := make([]byte, 20)
		if _, err = rand.Read(b); err != nil {
			fail(c, 500, err)
			return
		}
		secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
		a.securityMu.Lock()
		a.pendingTOTP[owner] = pendingTOTP{Secret: secret, Expires: time.Now().Add(10 * time.Minute)}
		a.securityMu.Unlock()
		uri := url.URL{Scheme: "otpauth", Host: "totp", Path: "/Magnet:" + p.Username}
		q := uri.Query()
		q.Set("issuer", "Magnet")
		q.Set("secret", secret)
		q.Set("algorithm", "SHA1")
		q.Set("digits", "6")
		q.Set("period", "30")
		uri.RawQuery = q.Encode()
		c.JSON(200, gin.H{"secret": secret, "uri": uri.String()})
	case "/enable":
		a.securityMu.Lock()
		pending, ok := a.pendingTOTP[owner]
		delete(a.pendingTOTP, owner)
		a.securityMu.Unlock()
		if !ok || time.Now().After(pending.Expires) {
			bad(c, "enrollment expired")
			return
		}
		step, valid := totpStep(pending.Secret, in.Code, 0)
		if !valid {
			bad(c, "invalid authenticator code; restart enrollment")
			return
		}
		codes := []string{}
		state := securityState{Secret: pending.Secret, LastStep: step}
		for range 8 {
			code := protocol.Secret()[:20]
			codes = append(codes, code)
			state.Recovery = append(state.Recovery, hash(code))
		}
		raw, err := a.protect("account-totp:"+p.ID, state)
		if err != nil {
			fail(c, 500, err)
			return
		}
		result, err := a.db.Exec("UPDATE account_users SET security=?,revision=revision+1 WHERE id=? AND security='' AND enabled=1", raw, p.ID)
		if err != nil {
			fail(c, 500, err)
			return
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			bad(c, "authenticator already enabled")
			return
		}
		a.bumpAccountSession(c, p.ID)
		a.revokeAccountSessions(c, p.ID)
		a.grantStepUp(token)
		c.JSON(200, gin.H{"recovery_codes": codes})
	case "/verify":
		if err := a.verifyUserCode(p.ID, in.Code); err != nil {
			bad(c, err.Error())
			return
		}
		a.grantStepUp(token)
		c.JSON(200, gin.H{"ok": true, "seconds": int(stepUpIdleWindow / time.Second)})
	case "/disable":
		if err := a.mutateUserCode(p.ID, in.Code, true); err != nil {
			bad(c, err.Error())
			return
		}
		a.bumpAccountSession(c, p.ID)
		a.revokeAccountSessions(c, p.ID)
		c.JSON(200, gin.H{"ok": true})
	default:
		c.AbortWithStatus(404)
	}
}

func (a *app) completeAccountMFA(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !a.sameOrigin(c) || c.GetHeader("X-Magnet-Request") != "1" {
		c.AbortWithStatus(403)
		return
	}
	token, _ := c.Cookie("magnet_session")
	owner := hash(token)
	a.mu.Lock()
	identity, ok := a.sessionUsers[owner]
	expiry := a.sessions[owner]
	a.mu.Unlock()
	if !ok || !identity.PendingMFA || time.Now().After(expiry) {
		fail(c, 401, errors.New("sign-in verification expired"))
		return
	}
	if !a.allowSecurityAttempt(identity.User + ":" + c.ClientIP()) {
		c.AbortWithStatus(429)
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "code required")
		return
	}
	if _, err := a.loadPrincipal(identity); err != nil {
		fail(c, 401, errors.New("account unavailable"))
		return
	}
	if err := a.verifyUserCode(identity.User, in.Code); err != nil {
		bad(c, err.Error())
		return
	}
	a.mu.Lock()
	delete(a.sessions, owner)
	delete(a.sessionUsers, owner)
	a.mu.Unlock()
	identity.PendingMFA = false
	if err := a.syncProviderGroup(identity); err != nil {
		fail(c, 401, errors.New("provider or account changed; sign in again"))
		return
	}
	a.issueAccountSession(c, identity, true)
	c.JSON(200, gin.H{"ok": true})
}
