package status

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	sharedweb "MagnetShared/web"
	"MagnetStatus/internal/config"
	webassets "MagnetStatus/web"

	"go.yaml.in/yaml/v3"
)

// Run starts the MagnetStatus command.
func Run() {
	path := flag.String("config", "/etc/magnet-status/status.yaml", "private YAML configuration")
	server := flag.String("server", "", "MagnetServer HTTPS origin")
	page := flag.String("page", "", "Monitoring ID")
	key := flag.String("key", "", "read-only Monitoring API key")
	listen := flag.String("listen", "", "web listener (default 0.0.0.0:8081)")
	cert := flag.String("tls-cert", "", "optional public HTTPS certificate")
	tlsKey := flag.String("tls-key", "", "optional public HTTPS private key")
	install := flag.Bool("install", false, "install and start Linux systemd service")
	flag.Parse()
	cfg := config.Config{Listen: "0.0.0.0:8081"}
	b, err := os.ReadFile(*path)
	if err == nil {
		if err = yaml.Unmarshal(b, &cfg); err != nil {
			log.Fatal("invalid status configuration")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Fatal(err)
	}
	if *server != "" {
		cfg.Server = strings.TrimRight(*server, "/")
	}
	if *page != "" {
		cfg.Page = *page
	}
	if *key != "" {
		cfg.Key = *key
	}
	if *listen != "" {
		cfg.Listen = *listen
	}
	if *cert != "" {
		cfg.TLSCert = *cert
	}
	if *tlsKey != "" {
		cfg.TLSKey = *tlsKey
	}
	if err = config.Validate(cfg); err != nil {
		log.Fatal(err)
	}
	if *install {
		if err = installService(cfg, *path); err != nil {
			log.Fatal(err)
		}
		log.Print("MagnetStatus installed; public listener ", cfg.Listen)
		return
	}
	// Foreground startup need not write /etc. To persist credentials use -install
	// or provide an existing private YAML file.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	r := &renderer{}
	go r.poll(ctx, cfg)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != "GET" && req.Method != "HEAD" {
			w.WriteHeader(405)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		r.mu.RLock()
		defer r.mu.RUnlock()
		if r.data == nil {
			w.WriteHeader(503)
			_, _ = io.WriteString(w, `{"error":"Status data is temporarily unavailable"}`)
			return
		}
		_ = json.NewEncoder(w).Encode(r.data)
	})
	for path, name := range map[string]string{"/": "index.html", "/status.js": "status.js", "/status.css": "status.css", "/scrollbars.js": "scrollbars.js", "/scrollbars.css": "scrollbars.css", "/i18n.js": "i18n.js", "/magnet-icon.png": "magnet-icon.png"} {
		mux.HandleFunc(path, func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path != path {
				http.NotFound(w, req)
				return
			}
			if req.Method != "GET" && req.Method != "HEAD" {
				w.WriteHeader(405)
				return
			}
			var source fs.ReadFileFS = webassets.Assets
			if name == "scrollbars.js" || name == "scrollbars.css" || name == "i18n.js" || name == "magnet-icon.png" {
				source = sharedweb.Assets
			}
			b, err := source.ReadFile(name)
			if err != nil {
				http.Error(w, "Unavailable", 500)
				return
			}
			types := map[string]string{"index.html": "text/html; charset=utf-8", "status.js": "application/javascript", "status.css": "text/css; charset=utf-8", "scrollbars.js": "application/javascript", "scrollbars.css": "text/css; charset=utf-8", "i18n.js": "application/javascript", "magnet-icon.png": "image/png"}
			w.Header().Set("Content-Type", types[name])
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(b)
		})
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
		mux.ServeHTTP(w, r)
	})
	srv := &http.Server{Addr: cfg.Listen, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		log.Print("MagnetStatus listening on ", cfg.Listen)
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
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}
