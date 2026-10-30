package status

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"MagnetStatus/internal/config"
)

func installService(c config.Config, path string) error {
	if runtime.GOOS != "linux" || os.Geteuid() != 0 {
		return errors.New("installation requires root on Linux with systemd")
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	// No shell interpolation. Restrict systemd paths so specifiers and control
	// characters cannot alter the generated unit.
	if strings.ContainsAny(path, "\r\n\x00%\"\\") {
		return errors.New("unsupported configuration path")
	}
	for _, directory := range []string{filepath.Dir(path), "/usr/local/lib/magnet-status", "/etc/systemd/system"} {
		for current := directory; current != "/"; current = filepath.Dir(current) {
			info, err := os.Lstat(current)
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
				return fmt.Errorf("installation directory must be a real directory: %s", current)
			}
		}
	}
	run := func(name string, args ...string) error {
		cmd := exec.Command(name, args...)
		var output bytes.Buffer
		cmd.Stdout = &output
		cmd.Stderr = &output
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("%s failed: %w: %s", name, err, output.String())
		}
		return nil
	}
	if exec.Command("id", "-u", "magnet-status").Run() != nil {
		if err = run("useradd", "--system", "--user-group", "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", "magnet-status"); err != nil {
			return err
		}
	}
	if err = os.MkdirAll("/usr/local/lib/magnet-status", 0755); err != nil {
		return err
	}
	source, err := os.Executable()
	if err != nil {
		return err
	}
	source, err = filepath.EvalSymlinks(source)
	if err != nil {
		return err
	}
	destination := "/usr/local/lib/magnet-status/MagnetStatus"
	if source != destination {
		in, err := os.Open(source)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.CreateTemp(filepath.Dir(destination), ".MagnetStatus-*")
		if err != nil {
			return err
		}
		defer os.Remove(out.Name())
		if _, err = io.Copy(out, in); err != nil {
			out.Close()
			return err
		}
		if err = out.Chmod(0755); err != nil {
			out.Close()
			return err
		}
		if err = out.Close(); err != nil {
			return err
		}
		if err = os.Rename(out.Name(), destination); err != nil {
			return err
		}
	}
	if err = config.Save(path, c); err != nil {
		return err
	}
	if err = run("chown", "magnet-status:magnet-status", path); err != nil {
		return err
	}
	if filepath.Dir(path) == "/etc/magnet-status" {
		if err = run("chgrp", "magnet-status", "/etc/magnet-status"); err != nil {
			return err
		}
		if err = os.Chmod("/etc/magnet-status", 0710); err != nil {
			return err
		}
	}
	unit := "[Unit]\nDescription=MagnetStatus public status page\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nUser=magnet-status\nGroup=magnet-status\nExecStart=" + destination + " -config \"" + path + "\"\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n"
	if err = os.WriteFile("/etc/systemd/system/magnet-status.service", []byte(unit), 0644); err != nil {
		return err
	}
	if err = run("systemctl", "daemon-reload"); err != nil {
		return err
	}
	if err = run("systemctl", "enable", "magnet-status.service"); err != nil {
		return err
	}
	return run("systemctl", "restart", "magnet-status.service")
}
