package server

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"MagnetServer/internal/config"
	"MagnetServer/internal/datastore"
	"MagnetServer/internal/middleware"
	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

func setupPort(listen string) string {
	_, port, err := net.SplitHostPort(listen)
	if err != nil {
		return ":8080"
	}
	return ":" + port
}

// Only the setup router is exposed until configuration has been committed.
// Successful setup shuts this listener down and main starts the normal server.
func serveSetup(ctx context.Context, path, listen, dataDir string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	path = abs
	defaults := config.Default()
	defaults.Listen = listen
	if dataDir == "" {
		dataDir = filepath.Join(filepath.Dir(path), "data")
	}
	defaults.DataDir, err = filepath.Abs(dataDir)
	if err != nil {
		return err
	}
	password := protocol.Secret()
	passwordHash := sha256.Sum256([]byte(password))
	var mu sync.Mutex
	complete := make(chan struct{})
	finished := false
	guard := &app{cfg: defaults, adminHash: passwordHash, sessions: map[string]time.Time{}, attempts: map[string][]time.Time{}}
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.RedirectTrailingSlash = false
	r.Use(gin.Recovery(), middleware.ScraperBlocker(), func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		c.Next()
	})
	if err = r.SetTrustedProxies(nil); err != nil {
		return err
	}
	guard.loginPageRoutes(r)
	r.POST("/api/login", guard.login)
	r.Match([]string{"GET", "HEAD"}, "/", guard.browserAuth(true), func(c *gin.Context) { redirectBrowser(c, "/setup") })
	r.Match([]string{"GET", "HEAD"}, "/setup", guard.browserAuth(true), webAsset("setup.html", "text/html; charset=utf-8"))
	r.Match([]string{"GET", "HEAD"}, "/setup.js", guard.browserAuth(false), webAsset("setup.js", "application/javascript"))
	r.Match([]string{"GET", "HEAD"}, "/style.css", guard.browserAuth(false), webAsset("style.css", "text/css; charset=utf-8"))
	r.GET("/api/setup", guard.auth, func(c *gin.Context) { c.JSON(200, gin.H{"listen": defaults.Listen, "data_dir": defaults.DataDir}) })
	r.POST("/api/setup", guard.auth, func(c *gin.Context) {
		if !guard.sameOrigin(c) || c.GetHeader("X-Magnet-Request") != "1" {
			c.AbortWithStatus(403)
			return
		}
		var in struct {
			Listen         string                `json:"listen"`
			PublicURL      string                `json:"public_url"`
			Database       config.DatabaseConfig `json:"database"`
			CreateDatabase bool                  `json:"create_database"`
			TLSCert        string                `json:"tls_cert"`
			TLSKey         string                `json:"tls_key"`
		}
		if c.ShouldBindJSON(&in) != nil {
			bad(c, "invalid setup settings")
			return
		}
		if !mu.TryLock() {
			fail(c, 409, errors.New("setup is already in progress"))
			return
		}
		defer mu.Unlock()
		if finished {
			fail(c, 409, errors.New("setup is already complete"))
			return
		}
		if _, err := os.Stat(path); err == nil {
			fail(c, 409, errors.New("configuration already exists; setup cannot replace it"))
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			fail(c, 500, errors.New("cannot inspect configuration path"))
			return
		}
		cfg := defaults
		cfg.Listen = in.Listen
		cfg.PublicURL = in.PublicURL
		cfg.Database = in.Database
		cfg.TLSCert = in.TLSCert
		cfg.TLSKey = in.TLSKey
		if err := cfg.Validate(); err != nil {
			bad(c, err.Error())
			return
		}
		for _, value := range []*string{&cfg.TLSCert, &cfg.TLSKey} {
			if *value != "" && !filepath.IsAbs(*value) {
				*value = filepath.Join(filepath.Dir(path), *value)
			}
		}
		if cfg.TLSCert != "" {
			if _, err := tls.LoadX509KeyPair(cfg.TLSCert, cfg.TLSKey); err != nil {
				bad(c, "cannot load the HTTPS certificate/key; check server paths and permissions")
				return
			}
		}
		setupCtx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		if in.CreateDatabase {
			if err := datastore.Create(setupCtx, cfg.Database); err != nil {
				fail(c, 400, err)
				return
			}
		}
		db, err := datastore.Open(setupCtx, cfg.Database)
		if err != nil {
			fail(c, 400, err)
			return
		}
		defer db.Close()
		if err = (&app{db: db}).schemaContext(setupCtx); err != nil {
			fail(c, 400, err)
			return
		}
		key, err := config.EnsureAdminKey(cfg.DataDir)
		if err != nil {
			fail(c, 500, errors.New("cannot create administrator key; check directory permissions"))
			return
		}
		if err = writeConfig(path, cfg, false); err != nil {
			fail(c, 500, errors.New("cannot save configuration; check configuration-directory permissions"))
			return
		}
		finished = true
		// Return the generated workspace credential only to the authenticated setup session.
		c.SetCookie("magnet_session", "", -1, "/", "", false, true)
		c.JSON(200, gin.H{"ok": true, "admin_key": string(key), "url": cfg.PublicURL, "preserve_origin": setupPort(cfg.Listen) == setupPort(defaults.Listen) && cfg.TLSCert == ""})
		close(complete)
	})
	listener, err := net.Listen("tcp", listen)
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: r, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 90 * time.Second, IdleTimeout: 30 * time.Second}
	stopped := make(chan error, 1)
	go func() { stopped <- srv.Serve(listener) }()
	// Explicitly printed once per unconfigured startup. Never expose it through HTTP.
	fmt.Printf("\nMagnet first-time setup is ready at http://YOUR_SERVER_IP%s\nInitialization password: %s\nOpen the login webpage and enter this password to configure MariaDB.\n\n", setupPort(listen), password)
	select {
	case <-ctx.Done():
		err = ctx.Err()
	case <-complete:
		err = nil
	case err = <-stopped:
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if stopErr := srv.Shutdown(shutdown); stopErr != nil {
		_ = srv.Close()
		if err == nil {
			err = stopErr
		}
	}
	return err
}
