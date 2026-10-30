package server

import (
	"bytes"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type cachedResponse struct {
	body      []byte
	expiresAt time.Time
}

type readLimit struct {
	window time.Time
	count  int
}

type cacheWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w cacheWriter) Write(data []byte) (int, error) {
	_, _ = w.body.Write(data)
	return w.ResponseWriter.Write(data)
}

func (w cacheWriter) WriteString(data string) (int, error) {
	_, _ = w.body.WriteString(data)
	return w.ResponseWriter.WriteString(data)
}

// cacheRead caches only successful, small JSON reads. Authentication and access
// checks run before this middleware, and the session identity is part of the key.
func (a *app) cacheRead(ttl time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet || c.Query("wait") == "1" {
			c.Next()
			return
		}
		token, _ := c.Cookie("magnet_session")
		identity := hash(token)
		key := identity + "\x00" + c.Request.URL.RequestURI()
		now := time.Now()
		a.readCacheMu.Lock()
		if a.readCache == nil {
			a.readCache = make(map[string]cachedResponse)
		}
		for k, entry := range a.readCache {
			if !entry.expiresAt.After(now) {
				delete(a.readCache, k)
			}
		}
		entry, ok := a.readCache[key]
		if ok && entry.expiresAt.After(now) {
			body := append([]byte(nil), entry.body...)
			a.readCacheMu.Unlock()
			c.Data(http.StatusOK, "application/json; charset=utf-8", body)
			return
		}
		a.readCacheMu.Unlock()

		body := &bytes.Buffer{}
		original := c.Writer
		c.Writer = cacheWriter{ResponseWriter: original, body: body}
		c.Next()
		c.Writer = original
		if original.Status() != http.StatusOK || body.Len() == 0 || body.Len() > 1<<20 || !strings.Contains(original.Header().Get("Content-Type"), "application/json") {
			return
		}
		a.readCacheMu.Lock()
		if len(a.readCache) >= 512 {
			for k, value := range a.readCache {
				if !value.expiresAt.After(now) {
					delete(a.readCache, k)
				}
			}
			if len(a.readCache) >= 512 {
				for k := range a.readCache {
					delete(a.readCache, k)
					break
				}
			}
		}
		a.readCache[key] = cachedResponse{body: append([]byte(nil), body.Bytes()...), expiresAt: now.Add(ttl)}
		a.readCacheMu.Unlock()
	}
}

func (a *app) allowReadRequest(c *gin.Context) bool {
	if c.Request.Method != http.MethodGet || c.Query("wait") == "1" {
		return true
	}
	token, _ := c.Cookie("magnet_session")
	key := hash(token)
	now := time.Now()
	a.readCacheMu.Lock()
	defer a.readCacheMu.Unlock()
	if a.readLimits == nil {
		a.readLimits = make(map[string]readLimit)
	}
	for id, limit := range a.readLimits {
		if now.Sub(limit.window) > time.Minute {
			delete(a.readLimits, id)
		}
	}
	limit := a.readLimits[key]
	if now.Sub(limit.window) >= time.Minute {
		limit = readLimit{window: now}
	}
	if limit.count >= 600 {
		c.Header("Retry-After", "60")
		c.AbortWithStatus(http.StatusTooManyRequests)
		return false
	}
	limit.count++
	a.readLimits[key] = limit
	return true
}
