package server

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

type packageUpload struct {
	ID      string `db:"id" json:"id"`
	Owner   string `db:"owner" json:"-"`
	Name    string `db:"name" json:"name"`
	Size    int64  `db:"size" json:"size"`
	SHA256  string `db:"sha256" json:"sha256"`
	Nodes   string `db:"nodes" json:"-"`
	Expires int64  `db:"expires" json:"expires"`
}

func (a *app) packagePath(id string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil || len(b) != 32 || len(id) != 43 {
		return "", errors.New("invalid package ID")
	}
	return filepath.Join(a.cfg.DataDir, "package-uploads", id+".deb"), nil
}

func (a *app) uploadPackage(c *gin.Context) {
	nodes := c.QueryArray("node")
	if len(nodes) == 0 || len(nodes) > 100 {
		bad(c, "select between 1 and 100 servers")
		return
	}
	for _, id := range nodes {
		if !a.requireAccess(c, "server", id, true) {
			return
		}
		var count int
		if err := a.db.Get(&count, "SELECT COUNT(*) FROM nodes WHERE id=?", id); err != nil || count != 1 {
			bad(c, "server not found")
			return
		}
	}
	name := c.Query("name")
	if len(name) > 255 || !strings.HasSuffix(strings.ToLower(name), ".deb") || strings.ContainsAny(name, "/\\\x00\r\n") {
		bad(c, "choose a .deb package filename")
		return
	}
	size := c.Request.ContentLength
	if size < 72 || size > protocol.PackageMaxSize {
		bad(c, "upload a .deb package with a known size, up to 512 MiB")
		return
	}
	controller := http.NewResponseController(c.Writer)
	_ = controller.SetReadDeadline(time.Now().Add(10 * time.Minute))
	_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Minute))
	token, _ := c.Cookie("magnet_session")
	item := packageUpload{ID: protocol.Secret(), Owner: hash(token), Name: name, Size: size, Nodes: marshal(nodes), Expires: time.Now().Add(24 * time.Hour).Unix()}
	path, _ := a.packagePath(item.ID)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		fail(c, 500, err)
		return
	}
	// Reserve storage before streaming; concurrent uploads share the same quota.
	a.cleanupPackages(false)
	a.packageMu.Lock()
	var reserved int64
	var count int
	err := a.db.Get(&reserved, "SELECT COALESCE(SUM(size),0) FROM package_uploads")
	if err == nil {
		err = a.db.Get(&count, "SELECT COUNT(*) FROM package_uploads")
	}
	if err == nil && (reserved+size > 2<<30 || count >= 32) {
		err = errors.New("package storage is full; temporary uploads expire after 24 hours")
		a.packageMu.Unlock()
		fail(c, http.StatusInsufficientStorage, err)
		return
	}
	if err == nil {
		_, err = a.db.Exec("INSERT INTO package_uploads(id,owner,name,size,sha256,nodes,expires) VALUES(?,?,?,?,?,?,?)", item.ID, item.Owner, item.Name, size, "", item.Nodes, item.Expires)
	}
	a.packageMu.Unlock()
	if err != nil {
		fail(c, 500, err)
		return
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.Remove(path)
			_, _ = a.db.Exec("DELETE FROM package_uploads WHERE id=?", item.ID)
		}
	}()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer file.Close()
	digest := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, digest), io.LimitReader(c.Request.Body, size+1))
	if err != nil || n != size {
		bad(c, "package upload was interrupted or has an invalid size")
		return
	}
	var header [72]byte
	_, err = file.ReadAt(header[:], 0)
	member := strings.TrimSuffix(strings.TrimSpace(string(header[8:24])), "/")
	if err != nil || string(header[:8]) != "!<arch>\n" || member != "debian-binary" || string(header[66:68]) != "`\n" || string(header[68:72]) != "2.0\n" {
		bad(c, "file is not a Debian package archive")
		return
	}
	if err = file.Sync(); err != nil {
		fail(c, 500, err)
		return
	}
	item.SHA256 = hex.EncodeToString(digest.Sum(nil))
	if _, err = a.db.Exec("UPDATE package_uploads SET sha256=? WHERE id=?", item.SHA256, item.ID); err != nil {
		fail(c, 500, err)
		return
	}
	complete = true
	c.JSON(201, item)
}

func (a *app) packageJobArgs(c *gin.Context, id string, nodes []string) (map[string]string, error) {
	var item packageUpload
	token, _ := c.Cookie("magnet_session")
	if err := a.db.Get(&item, "SELECT * FROM package_uploads WHERE id=? AND owner=? AND sha256<>'' AND expires>?", id, hash(token), time.Now().Unix()); err != nil {
		return nil, errors.New("uploaded package is unavailable or expired; upload it again")
	}
	var allowed []string
	if json.Unmarshal([]byte(item.Nodes), &allowed) != nil {
		return nil, errors.New("invalid package targets")
	}
	for _, node := range nodes {
		found := false
		for _, target := range allowed {
			found = found || target == node
		}
		if !found || !currentPrincipal(c).allows("server", node, true) {
			return nil, errors.New("package was not uploaded for this server")
		}
	}
	return map[string]string{"upload_id": item.ID, "sha256": item.SHA256, "size": strconv.FormatInt(item.Size, 10)}, nil
}

func (a *app) packageRoutes(r *gin.Engine, api *gin.RouterGroup) {
	api.POST("/packages", a.uploadPackage)
	r.POST("/link/packages/v1/chunk/:id", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		key, ok := a.updateKey(c)
		if !ok {
			return
		}
		id := c.Param("id")
		var request protocol.PackageChunkRequest
		if !a.encryptedUpdate(c, key, "package-chunk:"+id, &request) {
			return
		}
		var raw string
		if err := a.db.Get(&raw, "SELECT arguments FROM jobs WHERE id=? AND node_id=? AND kind='deb.install' AND status='running'", request.JobID, id); err != nil {
			fail(c, 403, errors.New("package job is not active for this Link"))
			return
		}
		var args map[string]string
		if a.unprotect("job:"+request.JobID, raw, &args) != nil || args["upload_id"] != request.UploadID {
			fail(c, 403, errors.New("package does not belong to this job"))
			return
		}
		var item packageUpload
		if a.db.Get(&item, "SELECT * FROM package_uploads WHERE id=? AND sha256<>'' AND expires>?", request.UploadID, time.Now().Unix()) != nil {
			fail(c, 404, errors.New("package expired or unavailable"))
			return
		}
		if request.Offset < 0 || request.Offset >= item.Size || request.Offset%protocol.PackageChunkSize != 0 {
			bad(c, "invalid package offset")
			return
		}
		path, err := a.packagePath(item.ID)
		if err != nil {
			bad(c, "invalid package")
			return
		}
		file, err := os.Open(path)
		if err != nil {
			fail(c, 404, errors.New("package unavailable"))
			return
		}
		defer file.Close()
		data := make([]byte, min(int64(protocol.PackageChunkSize), item.Size-request.Offset))
		if _, err = file.ReadAt(data, request.Offset); err != nil {
			fail(c, 500, errors.New("cannot read package"))
			return
		}
		encryptedUpdateReply(c, key, "package-chunk-reply:"+id+":"+c.GetString("request_nonce"), protocol.PackageChunk{Offset: request.Offset, Data: data})
	})
}

func (a *app) cleanupPackages(startup bool) {
	a.packageMu.Lock()
	defer a.packageMu.Unlock()
	items := []packageUpload{}
	query := "SELECT * FROM package_uploads WHERE expires<?"
	if startup {
		query += " OR sha256=''"
	}
	if err := a.db.Select(&items, query, time.Now().Unix()); err != nil {
		log.Printf("package cleanup: %v", err)
		return
	}
	for _, item := range items {
		path, err := a.packagePath(item.ID)
		if err == nil {
			err = os.Remove(path)
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("package cleanup: %v", err)
			continue
		}
		if _, err = a.db.Exec("DELETE FROM package_uploads WHERE id=?", item.ID); err != nil {
			log.Printf("package cleanup: %v", err)
		}
	}
}

func (a *app) packageLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.cleanupPackages(false)
		}
	}
}
