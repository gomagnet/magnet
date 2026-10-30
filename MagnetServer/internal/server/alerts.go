package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

type alert struct {
	ID        string  `db:"id" json:"id"`
	Name      string  `db:"name" json:"name"`
	NodeID    string  `db:"node_id" json:"node_id"`
	Metric    string  `db:"metric" json:"metric"`
	Threshold float64 `db:"threshold" json:"threshold"`
	URL       string  `db:"url" json:"url"`
	Method    string  `db:"method" json:"method"`
	Cooldown  int64   `db:"cooldown" json:"cooldown"`
	Fired     int64   `db:"fired" json:"fired"`
}

func (a *app) alerts(c *gin.Context) {
	rows := []alert{}
	scope, args := accessSQL(currentPrincipal(c), "node_id", "server", true)
	if err := a.db.Select(&rows, "SELECT * FROM alerts WHERE "+scope+" ORDER BY name", args...); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, rows)
}
func (a *app) saveAlert(c *gin.Context) {
	var in alert
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.Name) == "" {
		bad(c, "name required")
		return
	}
	switch in.Metric {
	case "cpu", "ram", "disk", "load", "offline":
	default:
		bad(c, "invalid metric")
		return
	}
	if math.IsNaN(in.Threshold) || math.IsInf(in.Threshold, 0) || in.Threshold < 0 {
		bad(c, "threshold must be nonnegative")
		return
	}
	if in.Method != "GET" && in.Method != "POST" {
		bad(c, "use GET or POST")
		return
	}
	u, err := url.Parse(in.URL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		bad(c, "HTTP(S) callback URL required")
		return
	}
	if in.Cooldown < 60 {
		in.Cooldown = 300
	}
	if in.NodeID != "" {
		var n int
		if a.db.Get(&n, "SELECT count(*) FROM nodes WHERE id=?", in.NodeID) != nil || n == 0 {
			bad(c, "unknown server")
			return
		}
	}
	if in.ID == "" {
		in.ID = protocol.Secret()
	}
	_, err = a.db.Exec(`INSERT INTO alerts(id,name,node_id,metric,threshold,url,method,cooldown) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),node_id=VALUES(node_id),metric=VALUES(metric),threshold=VALUES(threshold),url=VALUES(url),method=VALUES(method),cooldown=VALUES(cooldown)`, in.ID, in.Name, in.NodeID, in.Metric, in.Threshold, in.URL, in.Method, in.Cooldown)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, in)
}
func (a *app) deleteAlert(c *gin.Context) {
	if _, err := a.db.Exec("DELETE FROM alerts WHERE id=?", c.Param("id")); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) alertLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now().Unix()
			// Never repeat an uncertain destructive command after a lost acknowledgement.
			if _, err := a.db.Exec("UPDATE jobs SET status='unknown',output='Link did not acknowledge completion; inspect node before retrying',updated=? WHERE status='running' AND updated<?", now, now-2100); err != nil {
				log.Print(err)
			}
			_, _ = a.db.Exec("DELETE FROM samples WHERE sample_time<?", now-86400)
			_, _ = a.db.Exec("DELETE FROM enrollments WHERE expires<?", now)
			_, _ = a.db.Exec("DELETE FROM events WHERE event_time<?", now-30*86400)
			var rules []alert
			var nodes []node
			if a.db.Select(&rules, "SELECT * FROM alerts WHERE fired+cooldown<=?", now) != nil || a.db.Select(&nodes, "SELECT * FROM nodes") != nil {
				continue
			}
			for _, rule := range rules {
				triggered := false
				for _, n := range nodes {
					if rule.NodeID != "" && rule.NodeID != n.ID {
						continue
					}
					var m protocol.Metrics
					_ = json.Unmarshal([]byte(n.Raw), &m)
					value := map[string]float64{"cpu": m.CPU, "ram": m.RAM, "disk": m.Disk, "load": m.Load, "offline": float64(now - n.Seen)}[rule.Metric]
					if value <= rule.Threshold || (rule.Metric != "offline" && now-n.Seen > 45) {
						continue
					}
					body := marshal(map[string]any{"alert": rule.Name, "node": n.Hostname, "node_id": n.ID, "metric": rule.Metric, "value": value, "threshold": rule.Threshold, "time": now})
					triggered = true
					req, err := http.NewRequestWithContext(ctx, rule.Method, rule.URL, strings.NewReader(body))
					if err != nil {
						continue
					}
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("User-Agent", "Magnet/1")
					if rule.Method == "GET" {
						q := req.URL.Query()
						q.Set("node", n.Hostname)
						q.Set("metric", rule.Metric)
						q.Set("value", fmt.Sprint(value))
						req.URL.RawQuery = q.Encode()
						req.Body = nil
						req.ContentLength = 0
						req.GetBody = nil
					}
					resp, err := client.Do(req)
					message := "delivered"
					if err != nil {
						message = err.Error()
					} else {
						_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
						resp.Body.Close()
						if resp.StatusCode < 200 || resp.StatusCode >= 300 {
							message = resp.Status
						}
					}
					a.event(n.ID, fmt.Sprintf("Alert %s: %s = %.2f (%s)", rule.Name, rule.Metric, value, message))
				}
				// Rate-limit delivery attempts as well as successful callbacks.
				if triggered {
					_, _ = a.db.Exec("UPDATE alerts SET fired=? WHERE id=?", now, rule.ID)
				}
			}
		}
	}
}
