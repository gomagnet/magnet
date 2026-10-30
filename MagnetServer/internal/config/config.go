package config

import (
	"bytes"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	protocol "MagnetShared/protocol"

	"go.yaml.in/yaml/v3"
)

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
	TLS      bool   `yaml:"tls"`
}

type Config struct {
	TrustedProxies []string       `yaml:"trusted_proxies"`
	Listen         string         `yaml:"listen"`
	PublicURL      string         `yaml:"public_url"`
	DataDir        string         `yaml:"data_dir"`
	TLSCert        string         `yaml:"tls_cert"`
	TLSKey         string         `yaml:"tls_key"`
	SetupScript    string         `yaml:"setup_script"`
	Database       DatabaseConfig `yaml:"database"`
}

func Default() Config {
	return Config{TrustedProxies: []string{"127.0.0.0/8", "::1/128"}, Listen: "127.0.0.1:8080", PublicURL: "http://127.0.0.1:8080", DataDir: "data", Database: DatabaseConfig{Host: "127.0.0.1", Port: 3306, User: "magnet", Name: "magnet"}}
}

var databaseName = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)

func (cfg *Config) Validate() error {
	for _, proxy := range cfg.TrustedProxies {
		if net.ParseIP(proxy) == nil {
			if _, _, err := net.ParseCIDR(proxy); err != nil {
				return errors.New("trusted_proxies must contain IP addresses or CIDR networks")
			}
		}
	}
	u, err := url.Parse(cfg.PublicURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return errors.New("public_url must be an absolute HTTP(S) origin")
	}
	cfg.PublicURL = strings.TrimRight(cfg.PublicURL, "/")
	_, port, err := net.SplitHostPort(cfg.Listen)
	if err != nil {
		return errors.New("listen must contain a host and port")
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return errors.New("listen port must be between 1 and 65535")
	}
	if (cfg.TLSCert == "") != (cfg.TLSKey == "") {
		return errors.New("tls_cert and tls_key must be configured together")
	}
	if strings.TrimSpace(cfg.DataDir) == "" {
		return errors.New("data_dir is required")
	}
	db := cfg.Database
	if strings.TrimSpace(db.Host) == "" || strings.ContainsAny(db.Host, "\x00\r\n/()") || db.Port < 1 || db.Port > 65535 || strings.TrimSpace(db.User) == "" {
		return errors.New("database.host, port (1–65535), and user are required")
	}
	if !ValidDatabaseName(db.Name) {
		return errors.New("database.name must contain 1–64 letters, digits, or underscores")
	}
	return nil
}

func Load(path string) (Config, error) {
	cfg := Default()
	b, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	// Require an explicit datastore section; never silently connect using defaults.
	var fields map[string]yaml.Node
	if err = yaml.Unmarshal(b, &fields); err != nil {
		return cfg, fmt.Errorf("invalid configuration YAML")
	}
	node, ok := fields["database"]
	if !ok || node.Kind != yaml.MappingNode {
		return cfg, errors.New("database configuration is missing; add MariaDB host/port/user/password/name (see magnet.example.yaml)")
	}
	keys := map[string]bool{}
	for i := 0; i < len(node.Content); i += 2 {
		keys[node.Content[i].Value] = true
	}
	for _, key := range []string{"host", "port", "user", "password", "name"} {
		if !keys[key] {
			return cfg, fmt.Errorf("database.%s is required in configuration", key)
		}
	}
	d := yaml.NewDecoder(bytes.NewReader(b))
	d.KnownFields(true)
	if err = d.Decode(&cfg); err != nil {
		return cfg, errors.New("invalid configuration: check field names and value types in magnet.example.yaml")
	}
	if err = cfg.Validate(); err != nil {
		return cfg, err
	}
	// Relative filesystem settings belong to the configuration, not the shell cwd.
	abs, err := filepath.Abs(path)
	if err != nil {
		return cfg, err
	}
	base := filepath.Dir(abs)
	for _, value := range []*string{&cfg.DataDir, &cfg.TLSCert, &cfg.TLSKey} {
		if *value != "" && !filepath.IsAbs(*value) {
			*value = filepath.Join(base, *value)
		}
	}
	return cfg, nil
}

func EnsureAdminKey(dir string) ([]byte, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "admin.key")
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err == nil {
		key := []byte(protocol.Secret())
		if _, err = f.Write(key); err != nil {
			f.Close()
			return nil, err
		}
		if err = f.Close(); err != nil {
			return nil, err
		}
		return key, nil
	}
	if !errors.Is(err, os.ErrExist) {
		return nil, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(string(b))) < 32 {
		return nil, errors.New("admin.key must contain at least 32 characters")
	}
	return b, nil
}

// ValidDatabaseName reports whether a name can be used for the MariaDB database.
func ValidDatabaseName(name string) bool { return databaseName.MatchString(name) }
