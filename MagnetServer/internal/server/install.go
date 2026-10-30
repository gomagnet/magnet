package server

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"MagnetServer/internal/config"
)

func systemdQuote(value string) string {
	return "\"" + strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "%", "%%").Replace(value) + "\""
}

// Installation takes ownership of the data directory, so it must be dedicated
// to Magnet. Refuse unrelated existing contents and symlinked directories.
func validateInstallPaths(cfg config.Config) error {
	if runtime.GOOS != "linux" || os.Geteuid() != 0 {
		return errors.New("systemd installation requires root on Linux")
	}
	for _, path := range []string{"/opt/magnet", cfg.DataDir} {
		path = filepath.Clean(path)
		if !filepath.IsAbs(path) {
			return errors.New("installation data directory must be absolute")
		}
		for parent := path; parent != "/"; parent = filepath.Dir(parent) {
			info, err := os.Lstat(parent)
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 {
				return errors.New("installation directories must not contain symlinks")
			}
		}
	}
	path := filepath.Clean(cfg.DataDir)
	for _, protected := range []string{"/", "/opt", "/opt/magnet", "/etc", "/usr", "/usr/local", "/var", "/var/lib", "/home", "/root", "/run", "/tmp", "/srv", "/bin", "/sbin", "/lib", "/lib64"} {
		if path == protected {
			return errors.New("choose a dedicated data directory such as /opt/magnet/data")
		}
	}
	entries, err := os.ReadDir(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	allowed := map[string]bool{"admin.key": true, "vault.key": true, "security.json": true, "server.crt": true, "server.key": true, "magnet.db": true, "magnet.db-wal": true, "magnet.db-shm": true}
	for _, entry := range entries {
		if !allowed[entry.Name()] || !entry.Type().IsRegular() {
			return errors.New("installation data directory contains unrelated files; choose a dedicated empty directory")
		}
	}
	return nil
}

func installFromConfig(path, listen string) error {
	cfg, err := config.Load(path)
	configured := err == nil
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if !configured {
		cfg = config.Default()
		cfg.Listen = listen
		cfg.DataDir = "/opt/magnet/data"
	}
	if err = cfg.Validate(); err != nil {
		return err
	}
	return installServer(cfg, path, configured)
}

func installServer(cfg config.Config, sourcePath string, configured bool) error {
	configPath := "/opt/magnet/config/magnet.yaml"
	if source, err := filepath.Abs(sourcePath); err != nil {
		return err
	} else if source != configPath {
		if _, err = os.Stat(configPath); err == nil {
			return errors.New("installed configuration already exists; use -install -config " + configPath)
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if runtime.GOOS != "linux" || os.Geteuid() != 0 {
		return errors.New("-install requires root on Linux with systemd")
	}
	if err := validateInstallPaths(cfg); err != nil {
		return err
	}
	abs, err := filepath.Abs(configPath)
	if err != nil {
		return err
	}
	configPath = abs
	for _, value := range []string{configPath, cfg.DataDir, cfg.TLSCert, cfg.TLSKey} {
		if strings.ContainsAny(value, "\r\n\x00") {
			return errors.New("installation paths must not contain control characters")
		}
	}
	if cfg.TLSCert != "" {
		if _, err = tls.LoadX509KeyPair(cfg.TLSCert, cfg.TLSKey); err != nil {
			return fmt.Errorf("read HTTPS certificate/key: %w", err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	run := func(command string, args ...string) error {
		out, err := exec.CommandContext(ctx, command, args...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s: %w: %s", command, err, strings.TrimSpace(string(out)))
		}
		return nil
	}
	if _, err = exec.LookPath("systemctl"); err != nil {
		return errors.New("systemctl is required for service installation")
	}
	account, err := user.Lookup("magnet")
	if err != nil {
		var missing user.UnknownUserError
		if !errors.As(err, &missing) {
			return err
		}
		if err = run("useradd", "--system", "--user-group", "--home-dir", "/opt/magnet", "--shell", "/usr/sbin/nologin", "magnet"); err != nil {
			return err
		}
		account, err = user.Lookup("magnet")
		if err != nil {
			return err
		}
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return err
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return err
	}
	if uid == 0 {
		return errors.New("refusing to run the magnet service as a root account")
	}
	for _, dir := range []string{"/opt/magnet", filepath.Dir(configPath), cfg.DataDir} {
		if err = os.MkdirAll(dir, 0700); err != nil {
			return err
		}
	}
	// The executable remains root-owned; only the service's mutable state is writable.
	if err = os.Chmod("/opt/magnet", 0755); err != nil {
		return err
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if err = copyInstallFile(exe, "/opt/magnet/MagnetServer", 0755); err != nil {
		return err
	}
	owned := []string{cfg.DataDir, filepath.Dir(configPath)}
	if configured {
		if _, err = config.EnsureAdminKey(cfg.DataDir); err != nil {
			return err
		}
		owned = append(owned, filepath.Join(cfg.DataDir, "admin.key"))
		for _, name := range []string{"vault.key", "security.json"} {
			path := filepath.Join(cfg.DataDir, name)
			if _, err := os.Stat(path); err == nil {
				owned = append(owned, path)
			} else if !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
	}
	if cfg.TLSCert != "" {
		cert, key := filepath.Join(cfg.DataDir, "server.crt"), filepath.Join(cfg.DataDir, "server.key")
		if err = copyInstallFile(cfg.TLSCert, cert, 0600); err != nil {
			return err
		}
		if err = copyInstallFile(cfg.TLSKey, key, 0600); err != nil {
			return err
		}
		cfg.TLSCert, cfg.TLSKey = cert, key
		owned = append(owned, cert, key)
	}
	if configured {
		if err = writeConfig(configPath, cfg, true); err != nil {
			return err
		}
		if err = os.Chown(configPath, uid, gid); err != nil {
			return err
		}
		if err = os.Chmod(configPath, 0600); err != nil {
			return err
		}
	}
	for _, path := range owned {
		if err = os.Chown(path, uid, gid); err != nil {
			return err
		}
	}
	if err = os.Chmod(cfg.DataDir, 0700); err != nil {
		return err
	}
	if err = os.Chmod(filepath.Dir(configPath), 0700); err != nil {
		return err
	}
	unit := "[Unit]\nDescription=Magnet infrastructure workspace\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=magnet\nGroup=" + account.Gid + "\nWorkingDirectory=" + systemdQuote(filepath.Dir(configPath)) + "\nExecStart=/opt/magnet/MagnetServer -config " + systemdQuote(configPath) + " -setup-listen " + systemdQuote(cfg.Listen) + " -data-dir " + systemdQuote(cfg.DataDir) + "\nRestart=on-failure\nRestartSec=5\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nReadWritePaths=" + systemdQuote(cfg.DataDir) + " " + systemdQuote(filepath.Dir(configPath)) + "\n\n[Install]\nWantedBy=multi-user.target\n"
	if err = os.WriteFile("/etc/systemd/system/magnet-server.service", []byte(unit), 0644); err != nil {
		return err
	}
	if err = run("systemctl", "daemon-reload"); err != nil {
		return err
	}
	if err = run("systemctl", "enable", "magnet-server.service"); err != nil {
		return err
	}
	if err = run("systemctl", "restart", "magnet-server.service"); err != nil {
		return err
	}
	if err = run("systemctl", "is-active", "--quiet", "magnet-server.service"); err != nil {
		return err
	}
	fmt.Println("MagnetServer installed and started as magnet-server.service.")
	if !configured {
		fmt.Printf("Open http://YOUR_SERVER_IP%s to finish setup.\nRead the startup initialization password with: journalctl -u magnet-server.service -n 20 --no-pager\n", setupPort(cfg.Listen))
	}
	return nil
}
