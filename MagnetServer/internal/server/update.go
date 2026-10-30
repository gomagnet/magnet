package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

type linkArtifact struct {
	data     []byte
	info     os.FileInfo
	manifest protocol.UpdateManifest
}

func (a *app) initUpdates() {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("Link updater: %v", err)
		return
	}
	if resolved, e := filepath.EvalSymlinks(exe); e == nil {
		exe = resolved
	}
	a.artifactPath = filepath.Join(filepath.Dir(exe), "MagnetLink")
	if _, err = a.availableArtifact(); err != nil {
		log.Printf("Link update artifact unavailable: %v", err)
	}
}
func (a *app) closeArtifact() { a.updateMu.Lock(); a.artifact = nil; a.updateMu.Unlock() }
func (a *app) availableArtifact() (*linkArtifact, error) {
	a.updateMu.Lock()
	defer a.updateMu.Unlock()
	if a.artifactPath == "" {
		return nil, errors.New("artifact path not initialized")
	}
	info, err := os.Stat(a.artifactPath)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > protocol.UpdateMaxSize {
		return nil, errors.New("invalid Link artifact size/type")
	}
	if cached := a.artifact; cached != nil && os.SameFile(cached.info, info) && cached.info.Size() == info.Size() && cached.info.ModTime().Equal(info.ModTime()) {
		return cached, nil
	}
	f, err := os.Open(a.artifactPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	before, err := f.Stat()
	if err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(f, protocol.UpdateMaxSize+1))
	if err != nil {
		return nil, err
	}
	after, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if len(data) > protocol.UpdateMaxSize || int64(len(data)) != before.Size() || !before.ModTime().Equal(after.ModTime()) || before.Size() != after.Size() {
		return nil, errors.New("Link artifact changed while reading; publish it by atomic rename")
	}
	arch, err := protocol.LinuxBinaryArch(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	version, err := protocol.BinaryRelease(data)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(data)
	artifact := &linkArtifact{data: data, info: after, manifest: protocol.UpdateManifest{Protocol: 1, Available: true, Version: version, OS: "linux", Arch: arch, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(data)), ChunkSize: protocol.UpdateChunkSize}}
	a.artifact = artifact
	log.Printf("Link release %s (%s, %d bytes) available from %s", version, arch, len(data), a.artifactPath)
	return artifact, nil
}
func (a *app) updateKey(c *gin.Context) (string, bool) {
	var key string
	if a.db.Get(&key, "SELECT secret_key FROM nodes WHERE id=?", c.Param("id")) != nil {
		fail(c, 401, errors.New("unknown Link"))
		return "", false
	}
	return key, true
}
func (a *app) updateRoutes(r *gin.Engine) {
	// Frozen protocol: independent of application version and WebSocket schema.
	r.POST("/link/update/v1/manifest/:id", func(c *gin.Context) {
		key, ok := a.updateKey(c)
		if !ok {
			return
		}
		id := c.Param("id")
		var request protocol.UpdateRequest
		if !a.encryptedUpdate(c, key, "update-manifest:"+id, &request) {
			return
		}
		manifest := protocol.UpdateManifest{Protocol: 1}
		if artifact, err := a.availableArtifact(); err == nil {
			manifest = artifact.manifest
			manifest.Available = request.OS == manifest.OS && request.Arch == manifest.Arch && protocol.NewerVersion(manifest.Version, request.Version)
		}
		encryptedUpdateReply(c, key, "update-manifest-reply:"+id+":"+c.GetString("request_nonce"), manifest)
	})
	r.POST("/link/update/v1/chunk/:id", func(c *gin.Context) {
		key, ok := a.updateKey(c)
		if !ok {
			return
		}
		id := c.Param("id")
		var request protocol.UpdateChunkRequest
		if !a.encryptedUpdate(c, key, "update-chunk:"+id, &request) {
			return
		}
		artifact, err := a.availableArtifact()
		if err != nil || request.SHA256 != artifact.manifest.SHA256 {
			fail(c, 409, errors.New("release changed or unavailable; request a new manifest"))
			return
		}
		if request.Offset < 0 || request.Offset >= artifact.manifest.Size || request.Offset%protocol.UpdateChunkSize != 0 {
			bad(c, "invalid update offset")
			return
		}
		end := min(request.Offset+protocol.UpdateChunkSize, artifact.manifest.Size)
		encryptedUpdateReply(c, key, "update-chunk-reply:"+id+":"+c.GetString("request_nonce"), protocol.UpdateChunk{Offset: request.Offset, Data: artifact.data[request.Offset:end]})
	})
}
