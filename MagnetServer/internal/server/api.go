package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"MagnetShared/netutil"
	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

type node struct {
	GroupID     string           `db:"group_id" json:"group_id"`
	GroupName   string           `db:"group_name" json:"group_name"`
	GroupColor  string           `db:"group_color" json:"group_color"`
	Icon        string           `db:"icon" json:"icon"`
	LinkRemoved bool             `db:"link_removed" json:"link_removed"`
	DisplayName string           `db:"display_name" json:"display_name"`
	ID          string           `db:"id" json:"id"`
	Key         string           `db:"secret_key" json:"-"`
	Hostname    string           `db:"hostname" json:"hostname"`
	OS          string           `db:"os" json:"os"`
	Arch        string           `db:"arch" json:"arch"`
	Address     string           `db:"address" json:"address"`
	Seen        int64            `db:"seen" json:"seen"`
	Raw         string           `db:"metrics" json:"-"`
	Metrics     protocol.Metrics `db:"-" json:"metrics"`
	Online      bool             `db:"-" json:"online"`
}

func (a *app) newEnrollment(c *gin.Context) {
	var in struct {
		Script bool `json:"script"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid enrollment")
		return
	}
	id, key := protocol.Secret(), protocol.Secret()
	expires := time.Now().Add(15 * time.Minute).Unix()
	if _, err := a.db.Exec("INSERT INTO enrollments VALUES(?,?,?,?)", id, key, expires, in.Script); err != nil {
		fail(c, 500, err)
		return
	}
	// URL validation forbids credentials; shellQuote still handles every shell metacharacter.
	command := "sudo ./MagnetLink -server " + shellQuote(a.cfg.PublicURL) + " -key " + shellQuote(id+"."+key) + " -install"
	if !in.Script {
		command += " -no-script"
	}
	c.JSON(201, gin.H{"command": command, "expires": expires, "node_id": id})
}
func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'" }
func (a *app) enroll(c *gin.Context) {
	var ticket struct {
		Key     string `db:"secret_key"`
		Expires int64  `db:"expires"`
		Script  bool   `db:"script"`
	}
	id := c.Param("id")
	if err := a.db.Get(&ticket, "SELECT secret_key,expires,script FROM enrollments WHERE id=?", id); err != nil || ticket.Expires < time.Now().Unix() {
		fail(c, 401, errors.New("setup key invalid or expired"))
		return
	}
	var info protocol.NodeInfo
	if !a.encrypted(c, ticket.Key, "enroll:"+id, &info) {
		return
	}
	if info.Hostname == "" || len(info.Hostname) > 255 {
		bad(c, "invalid hostname")
		return
	}
	// Share the public setup/node identity so the UI can match this enrollment
	// to its connected node. The node access key is independently generated.
	credentials := protocol.Credentials{ID: id, Key: protocol.Secret()}
	if ticket.Script {
		credentials.Script = a.cfg.SetupScript
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	result, err := tx.Exec("DELETE FROM enrollments WHERE id=? AND expires>=?", id, time.Now().Unix())
	if err != nil {
		fail(c, 500, err)
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		bad(c, "setup key already consumed")
		return
	}
	host := nodePublicIPv4(info, c.ClientIP())
	_, err = tx.Exec("INSERT INTO nodes(id,secret_key,hostname,os,arch,address,seen,metrics) VALUES(?,?,?,?,?,?,?,?)", credentials.ID, credentials.Key, info.Hostname, info.OS, info.Arch, host, time.Now().Unix(), marshal(protocol.Metrics{}))
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.event(credentials.ID, "Link connected: "+info.Hostname)
	encryptedReply(c, ticket.Key, "enroll-reply:"+id+":"+c.GetString("request_nonce"), credentials)
}
func (a *app) syncLink(c *gin.Context) {
	id := c.Param("id")
	var key string
	if a.db.Get(&key, "SELECT secret_key FROM nodes WHERE id=?", id) != nil {
		fail(c, 401, errors.New("unknown Link"))
		return
	}
	var in protocol.Heartbeat
	if !a.encrypted(c, key, "sync:"+id, &in) {
		return
	}
	if len(in.Results) > 20 {
		bad(c, "too many results")
		return
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	if _, err = tx.Exec("UPDATE nodes SET hostname=?,os=?,arch=?,seen=?,metrics=?,address=? WHERE id=?", in.Info.Hostname, in.Info.OS, in.Info.Arch, now, marshal(in.Metrics), nodePublicIPv4(in.Info, c.ClientIP()), id); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec("INSERT INTO samples VALUES(?,?,?)", id, now, historyMetricsJSON(in.Metrics)); err != nil {
		fail(c, 500, err)
		return
	}
	for _, result := range in.Results {
		status, output := "succeeded", result.Output
		if result.Error != "" {
			status = "failed"
			output += "\n" + result.Error
		}
		if len(output) > 262144 {
			output = strings.ToValidUTF8(output[:262144], "?") + "\n[truncated]"
		}
		if _, err = tx.Exec("UPDATE jobs SET status=?,output=?,updated=? WHERE id=? AND node_id=? AND status IN ('running','unknown')", status, output, now, result.ID, id); err != nil {
			fail(c, 500, err)
			return
		}
	}
	// The legacy endpoint accepts telemetry/results only. It never collects
	// actions; updated Links use the authenticated persistent stream.
	jobs := []protocol.Job{}

	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	if len(in.Results) > 0 {
		a.notifyJobs()
	}
	encryptedReply(c, key, "sync-reply:"+id+":"+c.GetString("request_nonce"), protocol.Reply{Jobs: jobs})
}
func (a *app) nodes(c *gin.Context) {
	ns := []node{}
	scope, args := accessSQL(currentPrincipal(c), "nodes.id", "server")
	if err := a.db.Select(&ns, "SELECT nodes.*, COALESCE(sg.id,'') AS group_id,COALESCE(sg.name,'') AS group_name,COALESCE(sg.color,'') AS group_color, EXISTS(SELECT 1 FROM jobs WHERE jobs.node_id=nodes.id AND jobs.kind='link.uninstall' AND jobs.status='succeeded') AS link_removed FROM nodes LEFT JOIN server_group_nodes sgn ON sgn.node_id=nodes.id LEFT JOIN server_groups sg ON sg.id=sgn.group_id WHERE "+scope+" ORDER BY (sg.id IS NULL),sg.name,COALESCE(NULLIF(display_name,''),hostname)", args...); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range ns {
		ns[i].Address = netutil.PublicIPv4(ns[i].Address)
		_ = json.Unmarshal([]byte(ns[i].Raw), &ns[i].Metrics)
		ns[i].Metrics.Processes = nil
		ns[i].Online = !ns[i].LinkRemoved && a.linkConnected(ns[i].ID) && time.Now().Unix()-ns[i].Seen < 45
	}
	c.JSON(200, ns)
}
func (a *app) editNode(c *gin.Context) {
	var in struct {
		Name string  `json:"name"`
		Icon *string `json:"icon"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid node settings")
		return
	}
	if in.Icon != nil {
		if err := validateServerIcon(*in.Icon); err != nil {
			bad(c, err.Error())
			return
		}
	}
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) > 255 || strings.ContainsAny(in.Name, "\r\n\x00") {
		bad(c, "name must be at most 255 bytes and contain no line breaks")
		return
	}
	var exists int
	if a.db.Get(&exists, "SELECT count(*) FROM nodes WHERE id=?", c.Param("id")) != nil || exists == 0 {
		fail(c, 404, errors.New("node not found"))
		return
	}
	if _, err := a.db.Exec("UPDATE nodes SET display_name=?,icon=COALESCE(?,icon) WHERE id=?", in.Name, in.Icon, c.Param("id")); err != nil {
		fail(c, 500, err)
		return
	}
	a.event(c.Param("id"), "Node display settings updated")
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) deleteNode(c *gin.Context) {
	if _, err := a.db.Exec("DELETE FROM nodes WHERE id=?", c.Param("id")); err != nil {
		fail(c, 500, err)
		return
	}
	a.linksMu.Lock()
	peer := a.links[c.Param("id")]
	a.linksMu.Unlock()
	if peer != nil {
		peer.conn.Close()
	}
	a.notifyJobs()
	a.event(c.Param("id"), "Link revoked and removed")
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) history(c *gin.Context) {
	rows := []struct {
		Time    int64            `db:"sample_time" json:"time"`
		Raw     string           `db:"metrics" json:"-"`
		Metrics protocol.Metrics `db:"-" json:"metrics"`
	}{}
	if err := a.db.Select(&rows, "SELECT sample_time,metrics FROM samples WHERE node_id=? AND sample_time>? ORDER BY sample_time DESC LIMIT 360", c.Param("id"), time.Now().Add(-time.Hour).Unix()); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range rows {
		_ = json.Unmarshal([]byte(rows[i].Raw), &rows[i].Metrics)
	}
	c.JSON(200, rows)
}
func (a *app) jobs(c *gin.Context) {
	jobs := []protocol.Job{}
	scope, args := accessSQL(currentPrincipal(c), "node_id", "server")
	query := "SELECT * FROM jobs WHERE " + scope + " ORDER BY created DESC LIMIT 100"
	if id := c.Query("node"); id != "" {
		if !a.requireAccess(c, "server", id, false) {
			return
		}
		query = "SELECT * FROM jobs WHERE " + scope + " AND node_id=? ORDER BY created DESC LIMIT 100"
		args = append(args, id)
	}
	if err := a.db.Select(&jobs, query, args...); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, jobs)
}
func (a *app) createJobs(c *gin.Context) {
	if !a.stepUp(c) {
		return
	}
	var in struct {
		Nodes []string          `json:"nodes"`
		Kind  string            `json:"kind"`
		Args  map[string]string `json:"args"`
	}
	if c.ShouldBindJSON(&in) != nil || len(in.Nodes) == 0 || len(in.Nodes) > 100 {
		bad(c, "select between 1 and 100 servers")
		return
	}
	switch in.Kind {
	case "cleanup.scan", "cleanup.execute", "apt.sources.list", "apt.sources.write", "apt.sources.delete", "dns.read", "dns.write", "apt.install", "apt.update", "deb.install", "docker.list", "docker.action", "docker.shell", "docker.files", "docker.file.read", "compose.list", "compose.read", "compose.write", "compose.up", "service.list", "service.action", "service.read", "service.write", "service.create", "service.preview", "cron.snapshot", "cron.replace", "cron.read", "cron.write", "shell", "link.uninstall", "users.list", "users.create", "users.edit", "users.delete", "link.shell", "link.files", "link.file.read", "link.file.write", "link.file.mkdir", "link.file.rename", "link.file.remove", "database.status", "database.install", "database.ping", "database.schemas", "database.tables", "database.rows", "database.structure", "database.row.insert", "database.row.update", "database.row.delete", "database.query", "database.users", "database.user.save", "database.user.delete":
	default:
		bad(c, "unsupported job kind")
		return
	}
	if in.Args == nil {
		in.Args = map[string]string{}
	}
	if in.Args["profile_id"] != "" {
		bad(c, "connection profiles are no longer supported; use the Link process account")
		return
	}
	if strings.HasPrefix(in.Kind, "database.") {
		// Keep old Links on their existing passwordless socket path too.
		for _, key := range []string{"host", "port", "user", "password", "private_key", "socket", "tls"} {
			delete(in.Args, key)
		}
		in.Args["mode"] = "socket"
	}

	if in.Args["upload_id"] != "" {
		if in.Kind != "deb.install" {
			bad(c, "uploads are only available for Debian package installation")
			return
		}
		args, err := a.packageJobArgs(c, in.Args["upload_id"], in.Nodes)
		if err != nil {
			bad(c, err.Error())
			return
		}
		in.Args = args
	}

	jobs, peers, reserveErr := a.reserveJobs(in.Nodes, in.Kind, in.Args)
	if reserveErr != nil {
		fail(c, 409, reserveErr)
		return
	}
	committed := false
	defer func() {
		if !committed {
			for i, job := range jobs {
				a.releaseJob(peers[i], job.ID)
			}
		}
	}()
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		var count int
		if err = tx.Get(&count, "SELECT count(*) FROM nodes WHERE id=? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.node_id=nodes.id AND jobs.kind='link.uninstall' AND jobs.status='succeeded')", job.NodeID); err != nil || count == 0 {
			bad(c, "server is unknown or Link has been uninstalled")
			return
		}
		payload, protectErr := a.protect("job:"+job.ID, in.Args)
		if protectErr != nil {
			fail(c, 500, protectErr)
			return
		}
		if _, err = tx.Exec("INSERT INTO jobs(id,node_id,kind,arguments,status,output,created,updated) VALUES(?,?,?,?,'running','',?,?)", job.ID, job.NodeID, job.Kind, payload, job.Created, job.Updated); err != nil {
			fail(c, 500, err)
			return
		}
		ids = append(ids, job.ID)
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	committed = true
	// Dispatch selected nodes concurrently, without holding the registry lock.
	var deliveries sync.WaitGroup
	var deliveryMu sync.Mutex
	deliveryErrors := map[string]string{}
	for i, job := range jobs {
		deliveries.Add(1)
		go func(job protocol.Job, peer *linkPeer) {
			defer deliveries.Done()
			a.linksMu.Lock()
			current := a.links[job.NodeID] == peer
			a.linksMu.Unlock()
			var sendErr error
			if !current {
				sendErr = errors.New("Link disconnected before dispatch")
			} else {
				sendErr = peer.send(protocol.StreamMessage{Type: "job", Job: &job})
			}
			if sendErr != nil {
				message := "Link delivery interrupted; inspect Activity & jobs and the node before retrying"
				if _, dbErr := a.db.Exec("UPDATE jobs SET status='unknown',output=?,updated=? WHERE id=? AND status='running'", message, time.Now().Unix(), job.ID); dbErr != nil {
					log.Printf("Delivery status: %v", dbErr)
				}
				a.releaseJob(peer, job.ID)
				deliveryMu.Lock()
				deliveryErrors[job.NodeID] = message
				deliveryMu.Unlock()
			}
		}(job, peers[i])
	}
	deliveries.Wait()
	a.notifyJobs()
	a.event("", fmt.Sprintf("Dispatched %s to %d server(s)", in.Kind, len(ids)-len(deliveryErrors)))
	c.JSON(201, gin.H{"ids": ids, "delivery_errors": deliveryErrors})

}

func (a *app) jobByID(c *gin.Context) {
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	for {
		changed := a.watchJobs()
		var job protocol.Job
		if err := a.db.Get(&job, "SELECT * FROM jobs WHERE id=?", c.Param("id")); err != nil {
			fail(c, 404, errors.New("job not found"))
			return
		}
		if c.Query("wait") != "1" || (job.Status != "running" && job.Status != "queued") {
			c.JSON(200, job)
			return
		}
		select {
		case <-c.Request.Context().Done():
			return
		case <-timer.C:
			c.JSON(200, job)
			return
		case <-changed:
		}
	}
}

func (a *app) events(c *gin.Context) {
	rows := []struct {
		ID      string `db:"id" json:"id"`
		NodeID  string `db:"node_id" json:"node_id"`
		Message string `db:"message" json:"message"`
		Time    int64  `db:"event_time" json:"time"`
	}{}
	scope, args := accessSQL(currentPrincipal(c), "node_id", "server")
	query := "SELECT * FROM events WHERE " + scope + " ORDER BY event_time DESC LIMIT 100"
	if id := c.Query("node"); id != "" {
		if !a.requireAccess(c, "server", id, false) {
			return
		}
		query = "SELECT * FROM events WHERE " + scope + " AND node_id=? ORDER BY event_time DESC LIMIT 100"
		args = append(args, id)
	}
	if err := a.db.Select(&rows, query, args...); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, rows)
}
