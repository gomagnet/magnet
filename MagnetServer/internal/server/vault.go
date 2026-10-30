package server

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	protocol "MagnetShared/protocol"
)

func (a *app) loadVault() error {
	path := filepath.Join(a.cfg.DataDir, "vault.key")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err == nil {
		_, err = f.WriteString(protocol.Secret())
		closeErr := f.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	} else if !errors.Is(err, os.ErrExist) {
		return err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	key, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(string(b)))
	if err != nil || len(key) != 32 {
		return errors.New("invalid vault.key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	a.vault, err = cipher.NewGCM(block)
	return err
}
func (a *app) protect(purpose string, value any) (string, error) {
	b, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, a.vault.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return "vault1:" + base64.RawURLEncoding.EncodeToString(a.vault.Seal(nonce, nonce, b, []byte(purpose))), nil
}
func (a *app) unprotect(purpose, encoded string, value any) error {
	if !strings.HasPrefix(encoded, "vault1:") {
		return errors.New("unencrypted vault record")
	}
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(encoded, "vault1:"))
	if err != nil || len(b) < a.vault.NonceSize() {
		return errors.New("invalid vault record")
	}
	n := a.vault.NonceSize()
	b, err = a.vault.Open(nil, b[:n], b[n:], []byte(purpose))
	if err != nil {
		return errors.New("cannot decrypt vault record; check vault.key")
	}
	return json.Unmarshal(b, value)
}
