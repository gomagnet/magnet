package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

const stepUpIdleWindow = 30 * time.Minute

type securityState struct {
	Secret   string   `json:"secret"`
	LastStep int64    `json:"last_step"`
	Recovery []string `json:"recovery"`
}
type pendingTOTP struct {
	Secret  string
	Expires time.Time
}

func (a *app) loadSecurity() error {
	a.elevated = map[string]time.Time{}
	a.pendingTOTP = map[string]pendingTOTP{}
	b, err := os.ReadFile(filepath.Join(a.cfg.DataDir, "security.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return a.unprotect("totp", string(b), &a.security)
}
func (a *app) saveSecurity(state securityState) error {
	s, err := a.protect("totp", state)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(a.cfg.DataDir, ".security-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.WriteString(s); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), filepath.Join(a.cfg.DataDir, "security.json"))
}
func totpStep(secret, code string, last int64) (int64, bool) {
	if len(code) != 6 {
		return 0, false
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return 0, false
	}
	now := time.Now().Unix() / 30
	for _, offset := range []int64{0, -1, 1} {
		step := now + offset
		if step <= last {
			continue
		}
		var counter [8]byte
		binary.BigEndian.PutUint64(counter[:], uint64(step))
		mac := hmac.New(sha1.New, key)
		_, _ = mac.Write(counter[:])
		digest := mac.Sum(nil)
		i := digest[len(digest)-1] & 15
		n := (binary.BigEndian.Uint32(digest[i:i+4]) & 0x7fffffff) % 1000000
		if subtle.ConstantTimeCompare([]byte(fmt.Sprintf("%06d", n)), []byte(code)) == 1 {
			return step, true
		}
	}
	return 0, false
}
func (a *app) totpEnabled() bool {
	a.securityMu.Lock()
	defer a.securityMu.Unlock()
	return a.security.Secret != ""
}
func (a *app) verifyCode(code string) error {
	a.securityMu.Lock()
	defer a.securityMu.Unlock()
	return a.verifyCodeLocked(code)
}
func (a *app) verifyCodeLocked(code string) error {
	if a.security.Secret == "" {
		return errors.New("TOTP is not enabled")
	}
	state := a.security
	state.Recovery = append([]string(nil), state.Recovery...)
	if step, ok := totpStep(state.Secret, strings.TrimSpace(code), state.LastStep); ok {
		state.LastStep = step
	} else {
		index := -1
		digest := hash(strings.TrimSpace(code))
		for i, h := range state.Recovery {
			if subtle.ConstantTimeCompare([]byte(h), []byte(digest)) == 1 {
				index = i
				break
			}
		}
		if index < 0 {
			return errors.New("invalid or already used code")
		}
		state.Recovery = append(state.Recovery[:index], state.Recovery[index+1:]...)
	}
	if err := a.saveSecurity(state); err != nil {
		return err
	}
	a.security = state
	return nil
}
func (a *app) allowSecurityAttempt(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	if len(a.attempts) > 9000 {
		for id, attempts := range a.attempts {
			if len(attempts) == 0 || now.Sub(attempts[len(attempts)-1]) > 15*time.Minute {
				delete(a.attempts, id)
			}
		}
	}
	if _, exists := a.attempts["totp:"+key]; !exists && len(a.attempts) >= 10000 {
		return false
	}
	var recent []time.Time
	for _, t := range a.attempts["totp:"+key] {
		if now.Sub(t) < 5*time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= 10 {
		return false
	}
	a.attempts["totp:"+key] = append(recent, now)
	return true
}
func (a *app) requireTOTPSetup(c *gin.Context) bool {
	enabled := a.totpEnabled()
	if p := currentPrincipal(c); p != nil && !p.Root {
		var err error
		enabled, err = a.userTOTPEnabled(p.ID)
		if err != nil {
			fail(c, 503, errors.New("account security unavailable"))
			return false
		}
	}
	if enabled {
		return true
	}
	c.AbortWithStatusJSON(403, gin.H{"error": "Set up an authenticator in Settings before accessing sensitive tools", "code": "totp_setup_required"})
	return false
}
func (a *app) stepUp(c *gin.Context) bool {
	// The isolated first-run router must provision the database before a
	// normal account can enroll TOTP. This exception never applies in normal mode.
	if a.db == nil && c.Request.URL.Path == "/api/setup" {
		return true
	}
	if !a.requireTOTPSetup(c) {
		return false
	}
	t, _ := c.Cookie("magnet_session")
	a.mu.Lock()
	owner, now := hash(t), time.Now()
	expiry, sessionExpiry := a.elevated[owner], a.sessions[owner]
	if now.Before(expiry) && now.Before(sessionExpiry) {
		refreshed := now.Add(stepUpIdleWindow)
		if refreshed.After(sessionExpiry) {
			refreshed = sessionExpiry
		}
		a.elevated[owner] = refreshed
		a.mu.Unlock()
		return true
	}
	delete(a.elevated, owner)
	a.mu.Unlock()
	c.AbortWithStatusJSON(403, gin.H{"error": "Authenticator verification is required", "code": "step_up_required"})
	return false
}
func (a *app) grantStepUp(token string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for key, expiry := range a.elevated {
		if time.Now().After(expiry) {
			delete(a.elevated, key)
		}
	}
	owner := hash(token)
	sessionExpiry, ok := a.sessions[owner]
	if !ok || !time.Now().Before(sessionExpiry) {
		delete(a.elevated, owner)
		return
	}
	expiry := time.Now().Add(stepUpIdleWindow)
	if expiry.After(sessionExpiry) {
		expiry = sessionExpiry
	}
	a.elevated[owner] = expiry
}
func (a *app) securityRoutes(api *gin.RouterGroup) {
	api.POST("/security/check", func(c *gin.Context) {
		if a.stepUp(c) {
			c.JSON(200, gin.H{"ok": true})
		}
	})
	api.GET("/security", func(c *gin.Context) { c.JSON(200, gin.H{"enabled": a.totpEnabled()}) })
	api.POST("/security/enroll", func(c *gin.Context) {
		if a.totpEnabled() {
			bad(c, "TOTP is already enabled")
			return
		}
		var in struct {
			Key string `json:"key"`
		}
		if c.ShouldBindJSON(&in) != nil {
			bad(c, "administrator access key required")
			return
		}
		if !a.allowSecurityAttempt(c.ClientIP()) {
			c.AbortWithStatus(429)
			return
		}
		if subtle.ConstantTimeCompare([]byte(hash(in.Key)), []byte(fmt.Sprintf("%x", a.adminHash))) != 1 {
			fail(c, 400, errors.New("invalid administrator access key"))
			return
		}
		b := make([]byte, 20)
		if _, err := rand.Read(b); err != nil {
			fail(c, 500, err)
			return
		}
		secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
		t, _ := c.Cookie("magnet_session")
		a.securityMu.Lock()
		for k, p := range a.pendingTOTP {
			if time.Now().After(p.Expires) {
				delete(a.pendingTOTP, k)
			}
		}
		a.pendingTOTP[hash(t)] = pendingTOTP{secret, time.Now().Add(10 * time.Minute)}
		a.securityMu.Unlock()
		uri := url.URL{Scheme: "otpauth", Host: "totp", Path: "/Magnet:Administrator"}
		q := uri.Query()
		q.Set("issuer", "Magnet")
		q.Set("secret", secret)
		q.Set("algorithm", "SHA1")
		q.Set("digits", "6")
		q.Set("period", "30")
		uri.RawQuery = q.Encode()
		c.JSON(200, gin.H{"secret": secret, "uri": uri.String()})
	})
	api.POST("/security/enable", func(c *gin.Context) {
		var in struct {
			Code string `json:"code"`
		}
		if c.ShouldBindJSON(&in) != nil {
			bad(c, "code required")
			return
		}
		if !a.allowSecurityAttempt(c.ClientIP()) {
			c.AbortWithStatus(429)
			return
		}
		t, _ := c.Cookie("magnet_session")
		a.securityMu.Lock()
		defer a.securityMu.Unlock()
		p, ok := a.pendingTOTP[hash(t)]
		if a.security.Secret != "" || !ok || time.Now().After(p.Expires) {
			bad(c, "enrollment expired or already enabled")
			return
		}
		step, ok := totpStep(p.Secret, in.Code, 0)
		if !ok {
			bad(c, "invalid authenticator code")
			return
		}
		codes := []string{}
		state := securityState{Secret: p.Secret, LastStep: step}
		for i := 0; i < 8; i++ {
			code := protocol.Secret()[:20]
			codes = append(codes, code)
			state.Recovery = append(state.Recovery, hash(code))
		}
		if err := a.saveSecurity(state); err != nil {
			fail(c, 500, err)
			return
		}
		a.security = state
		delete(a.pendingTOTP, hash(t))
		a.mu.Lock()
		a.sessions = map[string]time.Time{hash(t): time.Now().Add(12 * time.Hour)}
		a.sessionUsers = map[string]sessionIdentity{}
		a.elevated = map[string]time.Time{}
		a.mu.Unlock()
		a.grantStepUp(t)
		c.JSON(200, gin.H{"recovery_codes": codes})
	})
	api.POST("/security/verify", func(c *gin.Context) {
		var in struct {
			Code string `json:"code"`
		}
		if c.ShouldBindJSON(&in) != nil {
			bad(c, "code required")
			return
		}
		if !a.allowSecurityAttempt(c.ClientIP()) {
			c.AbortWithStatus(429)
			return
		}
		if err := a.verifyCode(in.Code); err != nil {
			fail(c, 400, err)
			return
		}
		t, _ := c.Cookie("magnet_session")
		a.grantStepUp(t)
		c.JSON(200, gin.H{"ok": true, "seconds": int(stepUpIdleWindow / time.Second)})
	})
	api.POST("/security/disable", func(c *gin.Context) {
		var in struct {
			Code string `json:"code"`
		}
		if c.ShouldBindJSON(&in) != nil {
			bad(c, "current code required")
			return
		}
		if !a.allowSecurityAttempt(c.ClientIP()) {
			c.AbortWithStatus(429)
			return
		}
		if err := a.verifyCode(in.Code); err != nil {
			bad(c, err.Error())
			return
		}
		a.securityMu.Lock()
		defer a.securityMu.Unlock()
		if err := a.saveSecurity(securityState{}); err != nil {
			fail(c, 500, err)
			return
		}
		a.security = securityState{}
		c.JSON(200, gin.H{"ok": true})
	})
}
