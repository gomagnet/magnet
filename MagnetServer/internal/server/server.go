package server

import (
	"context"
	"crypto/cipher"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"MagnetServer/internal/config"
	"MagnetServer/internal/datastore"
	"MagnetServer/internal/middleware"
	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type app struct {
	packageMu    sync.Mutex
	readCacheMu  sync.Mutex
	readCache    map[string]cachedResponse
	readLimits   map[string]readLimit
	updateMu     sync.Mutex
	artifact     *linkArtifact
	artifactPath string
	linksMu      sync.Mutex
	links        map[string]*linkPeer
	jobMu        sync.Mutex
	jobChanged   chan struct{}
	db           *sqlx.DB
	cfg          config.Config
	adminHash    [32]byte
	mu           sync.Mutex
	sessions     map[string]time.Time
	sessionUsers map[string]sessionIdentity
	oidcFlows    map[string]oidcFlow
	seen         map[string]time.Time
	attempts     map[string][]time.Time
	vault        cipher.AEAD
	securityMu   sync.Mutex
	security     securityState
	pendingTOTP  map[string]pendingTOTP
	elevated     map[string]time.Time
}

// Run starts the MagnetServer command.
func Run() {
	configPath := flag.String("config", "magnet.yaml", "YAML configuration")
	install := flag.Bool("install", false, "install and start the Linux systemd service")
	setupListen := flag.String("setup-listen", "0.0.0.0:8080", "first-run setup HTTP listener")
	setupData := flag.String("data-dir", "", "local key directory for first-run setup")
	flag.Parse()
	if *install {
		if err := installFromConfig(*configPath, *setupListen); err != nil {
			log.Fatal(err)
		}
		return
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(*configPath)
	if errors.Is(err, os.ErrNotExist) {
		if err = serveSetup(ctx, *configPath, *setupListen, *setupData); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Fatal(err)
		}
		cfg, err = config.Load(*configPath)
	}
	if err != nil {
		log.Fatal(err)
	}
	b, err := config.EnsureAdminKey(cfg.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	db, err := datastore.Open(context.Background(), cfg.Database)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	a := &app{db: db, cfg: cfg, adminHash: sha256.Sum256([]byte(strings.TrimSpace(string(b)))), sessions: map[string]time.Time{}, seen: map[string]time.Time{}, attempts: map[string][]time.Time{}}
	if err = a.loadVault(); err != nil {
		log.Fatal(err)
	}
	if err = a.loadSecurity(); err != nil {
		log.Fatal(err)
	}
	if err = a.schema(); err != nil {
		log.Fatal(err)
	}
	// Interrupted commands are never replayed after a server restart.
	if _, err = a.db.Exec("UPDATE jobs SET status='unknown',output='Server restarted; inspect the node before retrying',updated=? WHERE status IN ('queued','running')", time.Now().Unix()); err != nil {
		log.Fatal(err)
	}
	a.cleanupPackages(true)
	a.initUpdates()
	defer a.closeArtifact()
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.RedirectTrailingSlash = false
	r.Use(gin.Recovery(), middleware.ScraperBlocker(), func(c *gin.Context) {
		limit := int64(4 << 20)
		if c.Request.Method == http.MethodPost && c.Request.URL.Path == "/api/packages" {
			limit = protocol.PackageMaxSize
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		c.Next()
	})
	if err = r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		log.Fatal(err)
	}
	r.POST("/api/login", a.login)
	r.POST("/link/v1/enroll/:id", a.enroll)
	r.POST("/link/v1/sync/:id", a.syncLink)
	r.GET("/link/v1/stream/:id", a.linkStream)
	a.updateRoutes(r)
	a.oidcRoutes(r)
	a.inviteRoutes(r)
	api := r.Group("/api", a.auth)
	api.GET("/session", a.sessionResponse)
	api.PUT("/account/avatar", a.saveAvatar)
	api.POST("/logout", a.logout)
	a.serverGroupRoutes(api)
	api.GET("/nodes", a.cacheRead(2*time.Second), a.nodes)
	api.DELETE("/nodes/:id", a.deleteNode)
	api.PATCH("/nodes/:id", a.editNode)
	api.GET("/nodes/:id/processes", a.processes)
	api.GET("/nodes/:id/history", a.cacheRead(3*time.Second), a.history)
	api.POST("/enrollments", a.newEnrollment)
	api.GET("/jobs", a.cacheRead(2*time.Second), a.jobs)
	api.POST("/jobs", a.createJobs)
	api.GET("/alerts", a.cacheRead(2*time.Second), a.alerts)
	api.POST("/alerts", a.saveAlert)
	api.DELETE("/alerts/:id", a.deleteAlert)
	api.GET("/events", a.cacheRead(2*time.Second), a.events)
	a.packageRoutes(r, api)
	a.securityRoutes(api)
	a.statusRoutes(r, api)
	a.accountRoutes(api)
	api.GET("/jobs/:id", a.jobByID)
	a.browserRoutes(r)
	srv := &http.Server{Addr: cfg.Listen, Handler: r, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go a.packageLoop(ctx)
	go a.alertLoop(ctx)
	go a.statusLoop(ctx)
	go func() {
		log.Printf("Magnet listening on %s", cfg.Listen)
		var err error
		if cfg.TLSCert != "" {
			err = srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey)
		} else {
			err = srv.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	a.closeLinks()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}
func fail(c *gin.Context, code int, err error) {
	c.AbortWithStatusJSON(code, gin.H{"error": err.Error()})
}
func bad(c *gin.Context, message string) { fail(c, 400, errors.New(message)) }
func hash(s string) string               { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func (a *app) sameOrigin(c *gin.Context) bool {
	if origin := c.GetHeader("Origin"); origin != "" {
		u, err := url.Parse(origin)
		return err == nil && u.Host == c.Request.Host && (u.Scheme == "http" || u.Scheme == "https")
	}
	return c.GetHeader("Sec-Fetch-Site") != "cross-site"
}
func (a *app) login(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !a.sameOrigin(c) {
		c.AbortWithStatus(403)
		return
	}
	a.mu.Lock()
	now := time.Now()
	for ip, times := range a.attempts {
		if len(times) == 0 || now.Sub(times[len(times)-1]) > 15*time.Minute {
			delete(a.attempts, ip)
		}
	}
	var recent []time.Time
	for _, t := range a.attempts[c.ClientIP()] {
		if now.Sub(t) < 15*time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= 10 || len(a.attempts) > 10000 {
		a.mu.Unlock()
		c.AbortWithStatus(429)
		return
	}
	a.attempts[c.ClientIP()] = append(recent, now)
	a.mu.Unlock()
	var in struct {
		Username string `json:"username"`
		Key      string `json:"key"`
		Code     string `json:"code"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid login")
		return
	}
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	if in.Username == "" {
		bad(c, "username is required")
		return
	}
	h := sha256.Sum256([]byte(in.Key))
	if in.Username != "admin" {
		if a.db == nil {
			fail(c, 401, errors.New("use username admin and the initialization password during setup"))
			return
		}
		a.loginAccount(c, in.Username, in.Key, in.Code)
		return
	}
	if subtle.ConstantTimeCompare(h[:], a.adminHash[:]) != 1 {
		fail(c, 401, errors.New("invalid access key"))
		return
	}
	a.securityMu.Lock()
	defer a.securityMu.Unlock()
	enabled := a.security.Secret != ""
	token := protocol.Secret()
	if enabled {
		if in.Code == "" {
			c.AbortWithStatusJSON(400, gin.H{"error": "Enter an authenticator or recovery code", "code": "totp_required"})
			return
		}
		if err := a.verifyCodeLocked(in.Code); err != nil {
			bad(c, err.Error())
			return
		}
	}
	a.mu.Lock()
	for k, expiry := range a.sessions {
		if expiry.Before(now) {
			delete(a.sessions, k)
			delete(a.sessionUsers, k)
			delete(a.elevated, k)
		}
	}
	a.sessions[hash(token)] = now.Add(12 * time.Hour)
	a.mu.Unlock()
	if enabled {
		a.grantStepUp(token)
	}
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("magnet_session", token, 43200, "/", "", a.cfg.TLSCert != "" || strings.HasPrefix(a.cfg.PublicURL, "https://"), true)
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) auth(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !a.sameOrigin(c) {
		c.AbortWithStatus(403)
		return
	}
	if c.Request.Method != "GET" && c.GetHeader("X-Magnet-Request") != "1" {
		c.AbortWithStatus(403)
		return
	}
	if !a.validSession(c) {
		c.AbortWithStatus(401)
		return
	}
	if !a.allowReadRequest(c) {
		return
	}
	if !a.authorizeAPI(c) {
		return
	}
	if p := currentPrincipal(c); p != nil && !p.Root && (c.Request.URL.Path == "/api/security" || strings.HasPrefix(c.Request.URL.Path, "/api/security/")) {
		a.personalSecurity(c)
		c.Abort()
		return
	}
	if c.Request.Method == http.MethodGet && (strings.HasPrefix(c.Request.URL.Path, "/api/access/") || c.Request.URL.Path == "/api/jobs" || strings.HasPrefix(c.Request.URL.Path, "/api/jobs/") || c.Request.URL.Path == "/api/alerts") {
		if !a.requireTOTPSetup(c) {
			return
		}
	}
	if c.Request.Method != "GET" && c.Request.URL.Path != "/api/logout" && !strings.HasPrefix(c.Request.URL.Path, "/api/security/") {
		if !a.stepUp(c) {
			return
		}
	}
	if c.Request.Method != http.MethodGet {
		a.readCacheMu.Lock()
		clear(a.readCache)
		a.readCacheMu.Unlock()
	}
	c.Next()
}
func (a *app) logout(c *gin.Context) {
	t, _ := c.Cookie("magnet_session")
	a.mu.Lock()
	delete(a.sessions, hash(t))
	delete(a.sessionUsers, hash(t))
	delete(a.elevated, hash(t))
	a.mu.Unlock()
	c.SetCookie("magnet_session", "", -1, "/", "", false, true)
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) event(node, message string) {
	if _, err := a.db.Exec("INSERT INTO events VALUES (?,?,?,?)", protocol.Secret(), node, message, time.Now().Unix()); err != nil {
		log.Printf("event: %v", err)
	}
}
func (a *app) encrypted(c *gin.Context, key, purpose string, dst any) bool {
	return a.encryptedWith(c, key, purpose, dst, protocol.Open)
}
func (a *app) encryptedUpdate(c *gin.Context, key, purpose string, dst any) bool {
	return a.encryptedWith(c, key, purpose, dst, protocol.OpenUpdate)
}
func (a *app) encryptedWith(c *gin.Context, key, purpose string, dst any, open func(string, string, protocol.Envelope, any) error) bool {
	var e protocol.Envelope
	if c.ShouldBindJSON(&e) != nil || open(key, purpose, e, dst) != nil {
		fail(c, 401, errors.New("invalid encrypted message"))
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for k, expiry := range a.seen {
		if expiry.Before(now) {
			delete(a.seen, k)
		}
	}
	id := purpose + ":" + e.Nonce
	if _, ok := a.seen[id]; ok {
		fail(c, 409, errors.New("replayed message"))
		return false
	}
	a.seen[id] = now.Add(5 * time.Minute)
	c.Set("request_nonce", e.Nonce)
	return true
}
func encryptedReply(c *gin.Context, key, purpose string, data any) {
	encryptedReplyWith(c, key, purpose, data, protocol.Seal)
}
func encryptedUpdateReply(c *gin.Context, key, purpose string, data any) {
	encryptedReplyWith(c, key, purpose, data, protocol.SealUpdate)
}
func encryptedReplyWith(c *gin.Context, key, purpose string, data any, seal func(string, string, any) (protocol.Envelope, error)) {
	e, err := seal(key, purpose, data)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, e)
}
func marshal(v any) string { b, _ := json.Marshal(v); return string(b) }
