package config

import (
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

type Config struct {
	Server  string `yaml:"server"`
	Page    string `yaml:"page"`
	Key     string `yaml:"key"`
	Listen  string `yaml:"listen"`
	TLSCert string `yaml:"tls_cert,omitempty"`
	TLSKey  string `yaml:"tls_key,omitempty"`
}

// Validate checks the public listener and private API credentials.
func Validate(c Config) error {
	u, err := url.Parse(c.Server)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return errors.New("-server must be an HTTPS origin with a valid certificate")
	}
	validID := func(s string) bool {
		if len(s) != 43 {
			return false
		}
		for _, r := range s {
			if !strings.ContainsRune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-", r) {
				return false
			}
		}
		return true
	}
	if !validID(c.Page) || !validID(c.Key) {
		return errors.New("provide a Monitoring ID and its API key")
	}
	if c.Listen == "" || (c.TLSCert == "") != (c.TLSKey == "") {
		return errors.New("listener required; TLS certificate and key must be supplied together")
	}
	return nil
}

// Save atomically writes private renderer credentials.
func Save(path string, c Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := yaml.Marshal(c)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".status-*.yaml")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
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
	return os.Rename(f.Name(), path)
}
