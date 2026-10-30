package server

import (
	"encoding/json"
	"errors"
	"time"

	protocol "MagnetShared/protocol"
	"github.com/gin-gonic/gin"
)

func (a *app) processes(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if !a.requireAccess(c, "server", c.Param("id"), false) {
		return
	}
	var row struct {
		Raw     string `db:"metrics"`
		Seen    int64  `db:"seen"`
		Removed bool   `db:"removed"`
	}
	if err := a.db.Get(&row, "SELECT metrics,seen,EXISTS(SELECT 1 FROM jobs WHERE node_id=nodes.id AND kind='link.uninstall' AND status='succeeded') AS removed FROM nodes WHERE id=?", c.Param("id")); err != nil {
		fail(c, 404, errors.New("node not found"))
		return
	}
	var metrics protocol.Metrics
	if err := json.Unmarshal([]byte(row.Raw), &metrics); err != nil {
		fail(c, 500, errors.New("process telemetry unavailable"))
		return
	}
	online := !row.Removed && a.linkConnected(c.Param("id")) && time.Now().Unix()-row.Seen < 45
	// Never present cached per-process counters as current on an offline node.
	if !online {
		metrics.Processes = nil
	}
	c.JSON(200, gin.H{"online": online, "snapshot": metrics.Processes})
}
