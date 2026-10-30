package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

type loginProvider struct {
	ID         string  `db:"id" json:"id"`
	Name       string  `db:"name" json:"name"`
	Issuer     string  `db:"issuer" json:"issuer"`
	ClientID   string  `db:"client_id" json:"client_id"`
	Secret     string  `db:"secret" json:"-"`
	Enabled    bool    `db:"enabled" json:"enabled"`
	Signup     bool    `db:"signup" json:"signup"`
	Group      *string `db:"group_id" json:"group_id"`
	Revision   int64   `db:"revision" json:"-"`
	HasSecret  bool    `db:"-" json:"has_secret"`
	AuthMethod string  `db:"-" json:"auth_method"`
}
type providerCredentials struct {
	Secret string `json:"secret"`
	Method string `json:"method"`
}
type oidcFlow struct {
	Provider string
	Revision int64
	Nonce    string
	Verifier string
	Browser  string
	Expires  time.Time
}
type secureOIDCTransport struct{}
type oidcBody struct {
	io.Reader
	io.Closer
}

func secureOIDCURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == ""
}
func (secureOIDCTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if !secureOIDCURL(req.URL.String()) {
		return nil, errors.New("OpenID endpoints require HTTPS")
	}
	resp, err := http.DefaultTransport.RoundTrip(req)
	if err == nil {
		resp.Body = &oidcBody{Reader: io.LimitReader(resp.Body, 8<<20), Closer: resp.Body}
	}
	return resp, err
}

var oidcHTTPClient = &http.Client{Timeout: 12 * time.Second, Transport: secureOIDCTransport{}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
	if len(via) >= 5 {
		return errors.New("too many OpenID redirects")
	}
	if !secureOIDCURL(req.URL.String()) {
		return errors.New("OpenID redirects require HTTPS")
	}
	// Discovery and JWKS GETs may use HTTPS canonical-host redirects. Keep
	// token POSTs on the original host so credentials cannot be forwarded.
	if req.Method != http.MethodGet && len(via) > 0 && !strings.EqualFold(req.URL.Hostname(), via[len(via)-1].URL.Hostname()) {
		return errors.New("OpenID token redirects must stay on the same host")
	}
	return nil
}}

func oidcDiscoveryReason(err error) string {
	var mismatch *oidc.IssuerMismatchError
	if errors.As(err, &mismatch) {
		return fmt.Sprintf("issuer mismatch (configured %q; discovery document advertises %q)", issuerLabel(mismatch.Provided), issuerLabel(mismatch.Discovered))
	}
	var requestErr *url.Error
	if errors.As(err, &requestErr) {
		return "provider request failed: " + requestErr.Err.Error()
	}
	return fmt.Sprintf("provider discovery response was invalid (%T)", err)
}

func issuerLabel(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "<invalid issuer URL>"
	}
	// Issuer identifiers are public. Omit query and fragment components from
	// diagnostics so provider-specific parameters never end up in server logs.
	return u.Scheme + "://" + u.Host + u.EscapedPath()
}

func (a *app) oidcRoutes(r *gin.Engine) {
	r.GET("/api/login/providers", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		rows := []struct {
			ID   string `db:"id" json:"id"`
			Name string `db:"name" json:"name"`
		}{}
		if err := a.db.Select(&rows, "SELECT id,name FROM login_providers WHERE enabled=1 ORDER BY name"); err != nil {
			fail(c, 503, errors.New("login providers unavailable"))
			return
		}
		c.JSON(200, rows)
	})
	r.GET("/auth/oidc/:provider/start", a.beginOIDC)
	r.GET("/auth/oidc/callback", a.finishOIDC)
	r.POST("/api/login/mfa", a.completeAccountMFA)
}
func (a *app) loginProviders(c *gin.Context) {
	rows := []loginProvider{}
	if err := a.db.Select(&rows, "SELECT * FROM login_providers ORDER BY name"); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range rows {
		var credentials providerCredentials
		if a.unprotect("oidc:"+rows[i].ID, rows[i].Secret, &credentials) != nil {
			fail(c, 500, errors.New("provider credentials unavailable"))
			return
		}
		rows[i].HasSecret = credentials.Secret != ""
		rows[i].AuthMethod = credentials.Method
	}
	c.JSON(200, gin.H{"providers": rows, "callback_url": strings.TrimRight(a.cfg.PublicURL, "/") + "/auth/oidc/callback"})
}
func (a *app) saveLoginProvider(c *gin.Context) {
	var in struct {
		loginProvider
		ClientSecret string `json:"client_secret"`
		AuthMethod   string `json:"auth_method"`
		ClearSecret  bool   `json:"clear_secret"`
	}
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 || len(in.Issuer) > 2000 || !secureOIDCURL(in.Issuer) || len(in.ClientID) == 0 || len(in.ClientID) > 500 || len(in.ClientSecret) > 8000 {
		bad(c, "provider name, HTTPS issuer and client ID required")
		return
	}
	u, _ := url.Parse(in.Issuer)
	if u.RawQuery != "" {
		bad(c, "issuer cannot contain a query")
		return
	}
	if in.Enabled && !secureOIDCURL(a.cfg.PublicURL) {
		bad(c, "configure an HTTPS public URL before enabling OpenID login")
		return
	}
	id := c.Param("provider")
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
	credentials := providerCredentials{Secret: in.ClientSecret, Method: in.AuthMethod}
	if credentials.Method == "" {
		credentials.Method = "client_secret_basic"
	}
	if !creating {
		var old loginProvider
		if tx.Get(&old, "SELECT * FROM login_providers WHERE id=? FOR UPDATE", id) != nil {
			fail(c, 404, errors.New("provider not found"))
			return
		}
		if old.Issuer != in.Issuer {
			bad(c, "issuer is immutable; create a separate provider for a different issuer")
			return
		}
		var previous providerCredentials
		if a.unprotect("oidc:"+id, old.Secret, &previous) != nil {
			fail(c, 500, errors.New("provider credentials unavailable"))
			return
		}
		if in.ClientSecret == "" && !in.ClearSecret {
			credentials.Secret = previous.Secret
		}
		if in.AuthMethod == "" {
			credentials.Method = previous.Method
		}
	}
	if credentials.Method != "client_secret_basic" && credentials.Method != "client_secret_post" && credentials.Method != "none" {
		bad(c, "invalid token endpoint authentication method")
		return
	}
	if credentials.Method == "none" {
		credentials.Secret = ""
	} else if credentials.Secret == "" {
		bad(c, "client secret required for the selected authentication method")
		return
	}
	if in.Group != nil && *in.Group == "" {
		in.Group = nil
	}
	if in.Group != nil {
		var found string
		if tx.Get(&found, "SELECT id FROM account_groups WHERE id=?", *in.Group) != nil {
			bad(c, "auto-assigned group not found")
			return
		}
	}
	encoded, err := a.protect("oidc:"+id, credentials)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if creating {
		_, err = tx.Exec("INSERT INTO login_providers(id,name,issuer,client_id,secret,enabled,signup,group_id) VALUES(?,?,?,?,?,?,?,?)", id, in.Name, in.Issuer, in.ClientID, encoded, in.Enabled, in.Signup, in.Group)
	} else {
		_, err = tx.Exec("UPDATE login_providers SET name=?,client_id=?,secret=?,enabled=?,signup=?,group_id=?,revision=revision+1 WHERE id=?", in.Name, in.ClientID, encoded, in.Enabled, in.Signup, in.Group, id)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "OpenID provider saved: "+in.Name)
	c.JSON(200, gin.H{"id": id})
}
func (a *app) deleteLoginProvider(c *gin.Context) {
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM account_memberships WHERE source=?", c.Param("provider")); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec("DELETE FROM login_providers WHERE id=?", c.Param("provider")); err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "OpenID provider deleted")
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) discoverOIDC(ctx context.Context, p loginProvider) (context.Context, *oidc.Provider, *oauth2.Config, error) {
	ctx = oidc.ClientContext(ctx, oidcHTTPClient)
	provider, err := oidc.NewProvider(ctx, p.Issuer)
	if err != nil {
		return ctx, nil, nil, fmt.Errorf("OpenID discovery failed: %w", err)
	}
	endpoint := provider.Endpoint()
	if !secureOIDCURL(endpoint.AuthURL) || !secureOIDCURL(endpoint.TokenURL) {
		return ctx, nil, nil, errors.New("OpenID endpoints require HTTPS")
	}
	var credentials providerCredentials
	if a.unprotect("oidc:"+p.ID, p.Secret, &credentials) != nil {
		return ctx, nil, nil, errors.New("provider credentials unavailable")
	}
	endpoint.AuthStyle = oauth2.AuthStyleInHeader
	if credentials.Method == "none" || credentials.Method == "client_secret_post" {
		endpoint.AuthStyle = oauth2.AuthStyleInParams
	}
	config := &oauth2.Config{ClientID: p.ClientID, ClientSecret: credentials.Secret, Endpoint: endpoint, RedirectURL: strings.TrimRight(a.cfg.PublicURL, "/") + "/auth/oidc/callback", Scopes: []string{oidc.ScopeOpenID, "profile", "email"}}
	return ctx, provider, config, nil
}
func (a *app) beginOIDC(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !a.allowSecurityAttempt("oidc:" + c.ClientIP()) {
		c.AbortWithStatus(429)
		return
	}
	var p loginProvider
	if a.db.Get(&p, "SELECT * FROM login_providers WHERE id=? AND enabled=1", c.Param("provider")) != nil || !secureOIDCURL(a.cfg.PublicURL) {
		redirectBrowser(c, "/login?oidc_error=1")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	_, _, config, err := a.discoverOIDC(ctx, p)
	if err != nil {
		log.Printf("OpenID login failed during provider discovery: %s", oidcDiscoveryReason(err))
		redirectBrowser(c, "/login?oidc_error=1")
		return
	}
	state, browser, nonce, verifier := protocol.Secret(), protocol.Secret(), protocol.Secret(), protocol.Secret()
	a.mu.Lock()
	if a.oidcFlows == nil {
		a.oidcFlows = map[string]oidcFlow{}
	}
	for id, flow := range a.oidcFlows {
		if time.Now().After(flow.Expires) {
			delete(a.oidcFlows, id)
		}
	}
	if len(a.oidcFlows) >= 1000 {
		a.mu.Unlock()
		c.AbortWithStatus(429)
		return
	}
	a.oidcFlows[hash(state)] = oidcFlow{Provider: p.ID, Revision: p.Revision, Nonce: nonce, Verifier: verifier, Browser: hash(browser), Expires: time.Now().Add(10 * time.Minute)}
	a.mu.Unlock()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("magnet_oidc", browser, 600, "/auth/oidc", "", true, true)
	digest := sha256.Sum256([]byte(verifier))
	authorization := config.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.SetAuthURLParam("code_challenge_method", "S256"), oauth2.SetAuthURLParam("code_challenge", base64.RawURLEncoding.EncodeToString(digest[:])))
	redirectBrowser(c, authorization)
}
func (a *app) finishOIDC(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	failure := func(stage string) {
		log.Printf("OpenID login failed during %s", stage)
		redirectBrowser(c, "/login?oidc_error=1")
	}
	state := c.Query("state")
	if len(state) != 43 {
		failure("callback state validation")
		return
	}
	a.mu.Lock()
	flow, ok := a.oidcFlows[hash(state)]
	delete(a.oidcFlows, hash(state))
	a.mu.Unlock()
	browser, _ := c.Cookie("magnet_oidc")
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("magnet_oidc", "", -1, "/auth/oidc", "", true, true)
	if !ok || time.Now().After(flow.Expires) || subtle.ConstantTimeCompare([]byte(flow.Browser), []byte(hash(browser))) != 1 || c.Query("error") != "" || len(c.Query("code")) == 0 || len(c.Query("code")) > 8192 {
		failure("browser session or authorization response validation")
		return
	}
	var p loginProvider
	if a.db.Get(&p, "SELECT * FROM login_providers WHERE id=? AND enabled=1 AND revision=?", flow.Provider, flow.Revision) != nil {
		failure("provider lookup or configuration revision check")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	ctx, provider, config, err := a.discoverOIDC(ctx, p)
	if err != nil {
		failure("provider discovery: " + oidcDiscoveryReason(err))
		return
	}
	token, err := config.Exchange(ctx, c.Query("code"), oauth2.SetAuthURLParam("code_verifier", flow.Verifier))
	if err != nil {
		failure("authorization code exchange")
		return
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		failure("ID token response validation")
		return
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: p.ClientID}).Verify(ctx, raw)
	if err != nil || len(idToken.Subject) == 0 || len(idToken.Subject) > 255 || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(flow.Nonce)) != 1 || idToken.IssuedAt.IsZero() || idToken.IssuedAt.After(time.Now().Add(time.Minute)) {
		failure("ID token, subject, nonce, or issue time validation")
		return
	}
	var claims struct {
		Picture         string `json:"picture"`
		Name            string `json:"name"`
		Email           string `json:"email"`
		AuthorizedParty string `json:"azp"`
	}
	if idToken.Claims(&claims) != nil || (len(idToken.Audience) > 1 && claims.AuthorizedParty != p.ClientID) || (claims.AuthorizedParty != "" && claims.AuthorizedParty != p.ClientID) {
		failure("ID token claims validation")
		return
	}
	if idToken.AccessTokenHash != "" && idToken.VerifyAccessToken(token.AccessToken) != nil {
		failure("access token hash validation")
		return
	}
	if claims.Picture == "" {
		info, infoErr := provider.UserInfo(ctx, oauth2.StaticTokenSource(token))
		if infoErr == nil && info.Subject == idToken.Subject {
			var profile struct {
				Picture string `json:"picture"`
			}
			if info.Claims(&profile) == nil {
				claims.Picture = profile.Picture
			}
		}
	}
	user, err := a.oidcAccount(p, idToken.Subject, claims.Name, claims.Email)
	if err != nil {
		failure("account lookup or signup")
		return
	}
	enabled, revision, err := a.userLoginSecurity(user)
	if err != nil {
		failure("account security lookup")
		return
	}
	identity := sessionIdentity{Picture: downloadProviderAvatar(ctx, claims.Picture, p.Issuer), User: user, Provider: p.ID, PendingMFA: enabled, UserRevision: revision, ProviderRevision: p.Revision}
	if !enabled {
		if err = a.syncProviderGroup(identity); err != nil {
			failure("automatic group assignment")
			return
		}
	}
	a.issueAccountSession(c, identity, false)
	if enabled {
		redirectBrowser(c, "/login?mfa=1")
	} else {
		redirectBrowser(c, "/dash")
	}
}
func (a *app) oidcAccount(p loginProvider, subject, name, email string) (string, error) {
	tx, err := a.db.Beginx()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var current loginProvider
	if err = tx.Get(&current, "SELECT * FROM login_providers WHERE id=? AND enabled=1 AND revision=? FOR UPDATE", p.ID, p.Revision); err != nil {
		return "", err
	}
	var user string
	err = tx.Get(&user, "SELECT user_id FROM account_identities WHERE provider_id=? AND subject_hash=?", p.ID, hash(subject))
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) || !current.Signup {
			return "", errors.New("account is not registered")
		}
		user = protocol.Secret()
		name = strings.TrimSpace(name)
		if name == "" {
			name = "OpenID user"
		}
		if len(name) > 200 {
			name = strings.ToValidUTF8(name[:200], "")
		}
		if len(email) > 255 {
			email = strings.ToValidUTF8(email[:255], "")
		}
		if _, err = tx.Exec("INSERT INTO account_users(id,username,name,email,password_hash,enabled,admin,security,created) VALUES(?,?,?,?,'',1,0,'',?)", user, "oidc-"+strings.ToLower(protocol.Secret()[:16]), name, email, time.Now().Unix()); err != nil {
			return "", err
		}
		if _, err = tx.Exec("INSERT INTO account_identities(provider_id,subject_hash,subject,user_id) VALUES(?,?,?,?)", p.ID, hash(subject), subject, user); err != nil {
			return "", err
		}
	}
	var enabled bool
	if err = tx.Get(&enabled, "SELECT enabled FROM account_users WHERE id=? FOR UPDATE", user); err != nil || !enabled {
		return "", errors.New("account disabled")
	}
	if err = tx.Commit(); err != nil {
		return "", err
	}
	return user, nil
}
func (a *app) syncProviderGroup(identity sessionIdentity) error {
	if identity.Provider == "" {
		return nil
	}
	tx, err := a.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var p loginProvider
	if err = tx.Get(&p, "SELECT * FROM login_providers WHERE id=? AND enabled=1 AND revision=? FOR UPDATE", identity.Provider, identity.ProviderRevision); err != nil {
		return err
	}
	var id string
	if err = tx.Get(&id, "SELECT id FROM account_users WHERE id=? AND enabled=1 AND revision=? FOR UPDATE", identity.User, identity.UserRevision); err != nil {
		return err
	}
	if _, err = tx.Exec("INSERT INTO account_avatars(owner,image) VALUES(?,?) ON DUPLICATE KEY UPDATE image=VALUES(image)", identity.User, identity.Picture); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM account_memberships WHERE user_id=? AND source=?", identity.User, p.ID); err != nil {
		return err
	}
	if p.Group != nil {
		if _, err = tx.Exec("INSERT INTO account_memberships(user_id,group_id,source) VALUES(?,?,?)", identity.User, *p.Group, p.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
