package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	protocol "MagnetShared/protocol"
	statusmodel "MagnetShared/status"

	"github.com/gin-gonic/gin"
)

type statusSettings struct {
	ShowServerStatus bool   `json:"show_server_status"`
	Title            string `json:"title"`
	Description      string `json:"description"`
	Accent           string `json:"accent"`
	Theme            string `json:"theme"`
	Website          string `json:"website"`
	Logo             string `json:"logo"`
	Footer           string `json:"footer"`
}
type statusPage struct {
	ID       string         `db:"id" json:"id"`
	Nodes    []string       `db:"-" json:"nodes"`
	Name     string         `db:"name" json:"name"`
	Raw      string         `db:"settings" json:"-"`
	Settings statusSettings `db:"-" json:"settings"`
	Services []string       `db:"-" json:"services"`
}
type statusCheckConfig struct {
	Kind           string            `json:"kind"`
	Target         string            `json:"target"`
	Method         string            `json:"method"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
	ExpectedStatus int               `json:"expected_status"`
	Match          string            `json:"match"`
	Value          string            `json:"value"`
	JSONPath       string            `json:"json_path"`
}
type statusCheck struct {
	ID          string             `db:"id" json:"id"`
	Node        *string            `db:"node_id" json:"node_id"`
	Page        *string            `db:"page_id" json:"page_id"`
	Name        string             `db:"name" json:"name"`
	Description string             `db:"description" json:"description"`
	Raw         string             `db:"config" json:"-"`
	Config      *statusCheckConfig `db:"-" json:"config,omitempty"`
	Enabled     bool               `db:"enabled" json:"enabled"`
	Interval    int                `db:"interval_seconds" json:"interval"`
	Next        int64              `db:"next_check" json:"-"`
	Checked     int64              `db:"checked" json:"checked"`
	State       string             `db:"state" json:"state"`
	Latency     int64              `db:"latency_ms" json:"latency_ms"`
}

func (a *app) statusRoutes(r *gin.Engine, api *gin.RouterGroup) {
	api.GET("/monitorings", a.cacheRead(2*time.Second), a.listMonitorings)
	api.POST("/monitorings", a.saveMonitoring)
	api.PUT("/monitorings/:page", a.saveMonitoring)
	api.DELETE("/monitorings/:page", a.deleteMonitoring)
	api.POST("/monitorings/:page/key", a.statusKey)
	api.GET("/monitorings/:page/preview", a.statusPreview)
	api.GET("/nodes/:id/status-services", a.listStatusChecks)
	api.GET("/nodes/:id/status-services/:service", a.statusCheckDetails)
	api.POST("/nodes/:id/status-services", a.saveStatusCheck)
	api.PUT("/nodes/:id/status-services/:service", a.saveStatusCheck)
	api.DELETE("/nodes/:id/status-services/:service", a.deleteStatusCheck)
	api.GET("/monitorings/:page/incidents", a.listStatusIncidents)
	api.POST("/monitorings/:page/incidents", a.saveStatusIncident)
	api.PUT("/monitorings/:page/incidents/:incident", a.saveStatusIncident)
	api.DELETE("/monitorings/:page/incidents/:incident", a.deleteStatusIncident)
	api.GET("/status-services", a.statusServiceCatalog)
	api.GET("/monitorings/:page/services", a.listStatusChecks)
	api.GET("/monitorings/:page/services/:service", a.statusCheckDetails)
	api.POST("/monitorings/:page/services", a.saveStatusCheck)
	api.PUT("/monitorings/:page/services/:service", a.saveStatusCheck)
	api.DELETE("/monitorings/:page/services/:service", a.deleteStatusCheck)
	r.GET("/status/v1/:page", a.statusFeed)
}
func (a *app) statusNode(c *gin.Context) bool {
	var id string
	if err := a.db.Get(&id, "SELECT id FROM nodes WHERE id=?", c.Param("id")); err != nil {
		fail(c, 404, errors.New("server not found"))
		return false
	}
	return true
}
func (a *app) statusPageFor(c *gin.Context) (statusPage, bool) {
	var p statusPage
	err := a.db.Get(&p, "SELECT id,name,settings FROM status_pages WHERE id=?", c.Param("page"))
	if err != nil {
		fail(c, 404, errors.New("status page not found"))
		return p, false
	}
	if json.Unmarshal([]byte(p.Raw), &p.Settings) != nil {
		fail(c, 500, errors.New("invalid status page settings"))
		return p, false
	}
	return p, true
}
func (a *app) listMonitorings(c *gin.Context) {
	pages := []statusPage{}
	scope, args := accessSQL(currentPrincipal(c), "id", "monitoring")
	if err := a.db.Select(&pages, "SELECT id,name,settings FROM status_pages WHERE "+scope+" ORDER BY name,id", args...); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range pages {
		p := &pages[i]
		p.Services = []string{}
		p.Nodes = []string{}
		if err := a.db.Select(&p.Nodes, "SELECT node_id FROM status_page_nodes WHERE page_id=? ORDER BY node_id", p.ID); err != nil {
			fail(c, 500, err)
			return
		}
		if err := json.Unmarshal([]byte(p.Raw), &p.Settings); err != nil {
			fail(c, 500, err)
			return
		}
		if err := a.db.Select(&p.Services, "SELECT service_id FROM status_page_services WHERE page_id=? ORDER BY position", p.ID); err != nil {
			fail(c, 500, err)
			return
		}
	}
	c.JSON(200, pages)
}

var statusColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func statusPublicURL(s string) bool {
	if s == "" {
		return true
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}
func (a *app) saveMonitoring(c *gin.Context) {
	var in statusPage
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid status page")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	s := in.Settings
	if in.Name == "" || len(in.Name) > 120 || len(s.Title) > 120 || len(s.Description) > 1000 || len(s.Footer) > 300 || len(s.Logo) > 2000 || len(s.Website) > 2000 || !statusColor.MatchString(s.Accent) || !statusPublicURL(s.Logo) || !statusPublicURL(s.Website) || (s.Theme != "auto" && s.Theme != "light" && s.Theme != "dark") || len(in.Services) > 100 || len(in.Nodes) > 100 {
		bad(c, "check name, lengths, HTTPS links, accent color, theme and service count")
		return
	}
	if s.Title == "" {
		s.Title = in.Name
	}
	id := c.Param("page")
	creating := id == ""
	if creating {
		id = protocol.Secret()
	} else {
		if _, ok := a.statusPageFor(c); !ok {
			return
		}
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	var previousSettings statusSettings
	if !creating {
		var found string
		if err = tx.Get(&found, "SELECT settings FROM status_pages WHERE id=? FOR UPDATE", id); err != nil {
			fail(c, 404, errors.New("status page not found"))
			return
		}
		if err = json.Unmarshal([]byte(found), &previousSettings); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if creating {
		_, err = tx.Exec("INSERT INTO status_pages(id,name,settings) VALUES(?,?,?)", id, in.Name, marshal(s))
	} else {
		_, err = tx.Exec("UPDATE status_pages SET name=?,settings=? WHERE id=?", in.Name, marshal(s), id)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	existingNodes, existingServices := []string{}, []string{}
	if err = tx.Select(&existingNodes, "SELECT node_id FROM status_page_nodes WHERE page_id=?", id); err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Select(&existingServices, "SELECT service_id FROM status_page_services WHERE page_id=?", id); err != nil {
		fail(c, 500, err)
		return
	}
	previousNodes, previousServices := map[string]bool{}, map[string]bool{}
	for _, v := range existingNodes {
		previousNodes[v] = true
	}
	for _, v := range existingServices {
		previousServices[v] = true
	}
	if _, err = tx.Exec("DELETE FROM status_page_services WHERE page_id=?", id); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec("DELETE FROM status_page_nodes WHERE page_id=?", id); err != nil {
		fail(c, 500, err)
		return
	}
	nodes := map[string]bool{}
	for _, node := range in.Nodes {
		var found string
		if nodes[node] || tx.Get(&found, "SELECT id FROM nodes WHERE id=?", node) != nil {
			bad(c, "select distinct existing servers")
			return
		}
		if (!previousNodes[node] || (s.ShowServerStatus && !previousSettings.ShowServerStatus)) && !a.requireAccess(c, "server", node, false) {
			return
		}
		nodes[node] = true
		if _, err = tx.Exec("INSERT INTO status_page_nodes(page_id,node_id) VALUES(?,?)", id, node); err != nil {
			fail(c, 500, err)
			return
		}
	}
	seen := map[string]bool{}
	for position, service := range in.Services {
		var owner struct {
			Node *string `db:"node_id"`
			Page *string `db:"page_id"`
		}
		if seen[service] || tx.Get(&owner, "SELECT node_id,page_id FROM status_checks WHERE id=?", service) != nil || !((owner.Node != nil && nodes[*owner.Node] && (currentPrincipal(c).allows("server", *owner.Node, false) || previousServices[service])) || (owner.Page != nil && *owner.Page == id)) {
			bad(c, "select distinct services from the selected servers or this status page")
			return
		}
		seen[service] = true
		if _, err = tx.Exec("INSERT INTO status_page_services VALUES(?,?,?)", id, service, position); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": id})
}
func (a *app) deleteMonitoring(c *gin.Context) {
	if _, ok := a.statusPageFor(c); !ok {
		return
	}
	if _, err := a.db.Exec("DELETE FROM status_pages WHERE id=?", c.Param("page")); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (a *app) statusKey(c *gin.Context) {
	p, ok := a.statusPageFor(c)
	if !ok {
		return
	}
	u, err := url.Parse(a.cfg.PublicURL)
	if err != nil || u.Scheme != "https" {
		bad(c, "configure an HTTPS public URL for MagnetServer before installing MagnetStatus")
		return
	}
	key := protocol.Secret()
	if _, err = a.db.Exec("UPDATE status_pages SET key_hash=? WHERE id=?", hash(key), p.ID); err != nil {
		fail(c, 500, err)
		return
	}
	a.event("", "Rotated MagnetStatus renderer API key: "+p.Name)
	c.JSON(200, gin.H{"command": "sudo ./MagnetStatus -server " + shellQuote(strings.TrimRight(a.cfg.PublicURL, "/")) + " -page " + shellQuote(p.ID) + " -key " + shellQuote(key) + " -install", "key": key, "page_id": p.ID})
}
func (a *app) statusServiceCatalog(c *gin.Context) {
	checks := []statusCheck{}
	nodeScope, args := accessSQL(currentPrincipal(c), "c.node_id", "server")
	pageScope, pageArgs := accessSQL(currentPrincipal(c), "m.page_id", "monitoring")
	args = append(args, pageArgs...)
	if err := a.db.Select(&checks, "SELECT c.* FROM status_checks c WHERE c.node_id IS NOT NULL AND ("+nodeScope+" OR EXISTS(SELECT 1 FROM status_page_services m WHERE m.service_id=c.id AND "+pageScope+")) ORDER BY c.name,c.id", args...); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range checks {
		checks[i].State = checks[i].publicState()
	}
	c.JSON(200, checks)
}

// Scope comes exclusively from the route, never from client-supplied ownership.
func (a *app) statusCheckScope(c *gin.Context) (string, string, bool) {
	if page := c.Param("page"); page != "" {
		_, ok := a.statusPageFor(c)
		return "page_id", page, ok
	}
	return "node_id", c.Param("id"), a.statusNode(c)
}
func (a *app) listStatusChecks(c *gin.Context) {
	column, owner, ok := a.statusCheckScope(c)
	if !ok {
		return
	}
	checks := []statusCheck{}
	if err := a.db.Select(&checks, "SELECT * FROM status_checks WHERE "+column+"=? ORDER BY name,id", owner); err != nil {
		fail(c, 500, err)
		return
	}
	for i := range checks {
		checks[i].State = checks[i].publicState()
	}
	c.JSON(200, checks)
}
func (s statusCheck) publicState() string {
	if !s.Enabled || s.Checked == 0 || time.Now().Unix()-s.Checked > int64(s.Interval*2+15) {
		return "unknown"
	}
	return s.State
}
func (a *app) statusCheckDetails(c *gin.Context) {
	// Explicitly verified access is required before revealing custom request secrets.
	if !a.stepUp(c) {
		return
	}
	column, owner, ok := a.statusCheckScope(c)
	if !ok {
		return
	}
	kind := "server"
	if column == "page_id" {
		kind = "monitoring"
	}
	if !a.requireAccess(c, kind, owner, true) {
		return
	}
	var s statusCheck
	if a.db.Get(&s, "SELECT * FROM status_checks WHERE id=? AND "+column+"=?", c.Param("service"), owner) != nil {
		fail(c, 404, errors.New("service not found"))
		return
	}
	var cfg statusCheckConfig
	if err := a.unprotect("status-check:"+s.ID, s.Raw, &cfg); err != nil {
		fail(c, 500, err)
		return
	}
	s.Config = &cfg
	c.JSON(200, s)
}
func (a *app) saveStatusCheck(c *gin.Context) {
	column, owner, ok := a.statusCheckScope(c)
	if !ok {
		return
	}
	var s statusCheck
	if c.ShouldBindJSON(&s) != nil || s.Config == nil {
		bad(c, "invalid service")
		return
	}
	s.Name = strings.TrimSpace(s.Name)
	if s.Name == "" || len(s.Name) > 120 || len(s.Description) > 500 || s.Interval < 30 || s.Interval > 3600 {
		bad(c, "name required; interval must be 30–3600 seconds")
		return
	}
	if err := validateStatusCheck(s.Config); err != nil {
		bad(c, err.Error())
		return
	}
	id := c.Param("service")
	creating := id == ""
	if creating {
		id = protocol.Secret()
	}
	raw, err := a.protect("status-check:"+id, s.Config)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if creating {
		_, err = a.db.Exec("INSERT INTO status_checks(id,"+column+",name,description,config,enabled,interval_seconds) VALUES(?,?,?,?,?,?,?)", id, owner, s.Name, s.Description, raw, s.Enabled, s.Interval)
	} else {
		var result sql.Result
		result, err = a.db.Exec("UPDATE status_checks SET name=?,description=?,config=?,enabled=?,interval_seconds=?,next_check=0,checked=0,state='unknown' WHERE id=? AND "+column+"=?", s.Name, s.Description, raw, s.Enabled, s.Interval, id, owner)
		if err == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				fail(c, 404, errors.New("service not found"))
				return
			}
		}
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": id})
}
func (a *app) deleteStatusCheck(c *gin.Context) {
	column, owner, ok := a.statusCheckScope(c)
	if !ok {
		return
	}
	if _, err := a.db.Exec("DELETE FROM status_checks WHERE id=? AND "+column+"=?", c.Param("service"), owner); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (a *app) statusIncidents(page string) ([]statusmodel.StatusIncident, error) {
	var documents []string
	items := []statusmodel.StatusIncident{}
	if err := a.db.Select(&documents, "SELECT document FROM status_incidents WHERE page_id=? ORDER BY (state NOT IN ('resolved','completed')) DESC,updated DESC LIMIT 200", page); err != nil {
		return nil, err
	}
	for _, raw := range documents {
		var i statusmodel.StatusIncident
		if err := json.Unmarshal([]byte(raw), &i); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}
func (a *app) listStatusIncidents(c *gin.Context) {
	p, ok := a.statusPageFor(c)
	if !ok {
		return
	}
	items, err := a.statusIncidents(p.ID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, items)
}
func statusTransitions(kind string) []string {
	if kind == "maintenance" {
		return []string{"scheduled", "in_progress", "verifying", "completed"}
	}
	return []string{"investigating", "identified", "monitoring", "resolved"}
}
func statusStage(kind, state string) int {
	for n, s := range statusTransitions(kind) {
		if s == state {
			return n
		}
	}
	return -1
}
func (a *app) saveStatusIncident(c *gin.Context) {
	p, ok := a.statusPageFor(c)
	if !ok {
		return
	}
	var in struct {
		statusmodel.StatusIncident
		Message string `json:"message"`
	}
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.Title) == "" || len(in.Title) > 200 || len(in.Message) > 5000 || strings.TrimSpace(in.Message) == "" || len(in.Services) == 0 || len(in.Services) > 100 || (in.Kind != "incident" && in.Kind != "maintenance") || (in.Impact != "degraded" && in.Impact != "outage") || statusStage(in.Kind, in.Status) < 0 {
		bad(c, "title, update, affected services, valid impact and lifecycle stage required")
		return
	}
	if in.Kind == "maintenance" && (in.Start <= 0 || in.End <= in.Start) {
		bad(c, "maintenance requires a valid start and end")
		return
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	// All incident writes lock their page first, avoiding races with selection edits.
	var locked string
	if err = tx.Get(&locked, "SELECT id FROM status_pages WHERE id=? FOR UPDATE", p.ID); err != nil {
		fail(c, 404, errors.New("status page not found"))
		return
	}
	for _, id := range in.Services {
		var found string
		if tx.Get(&found, "SELECT service_id FROM status_page_services WHERE page_id=? AND service_id=?", p.ID, id) != nil {
			bad(c, "affected services must be selected on this status page")
			return
		}
	}
	item := in.StatusIncident
	item.ID = c.Param("incident")
	now := time.Now().Unix()
	item.Created = now
	item.Updates = []statusmodel.StatusUpdate{}
	if item.ID != "" {
		var raw string
		if tx.Get(&raw, "SELECT document FROM status_incidents WHERE id=? AND page_id=? FOR UPDATE", item.ID, p.ID) != nil {
			fail(c, 404, errors.New("incident not found"))
			return
		}
		var previous statusmodel.StatusIncident
		if json.Unmarshal([]byte(raw), &previous) != nil {
			fail(c, 500, errors.New("invalid incident record"))
			return
		}
		if previous.Kind != item.Kind || statusStage(item.Kind, item.Status) < statusStage(previous.Kind, previous.Status) || statusStage(previous.Kind, previous.Status) == 3 {
			bad(c, "lifecycle may only move forwards; completed records are immutable")
			return
		}
		item.Created = previous.Created
		item.Updates = previous.Updates
	} else {
		var active int
		if err = tx.Get(&active, "SELECT COUNT(*) FROM status_incidents WHERE page_id=? AND state NOT IN ('resolved','completed')", p.ID); err != nil {
			fail(c, 500, err)
			return
		}
		if active >= 100 {
			bad(c, "resolve or complete an existing record before opening more than 100 active records")
			return
		}
		item.ID = protocol.Secret()
	}
	limit := 100
	if item.Kind == "maintenance" {
		limit = 98
	}
	if len(item.Updates) >= limit {
		bad(c, "incident update limit reached")
		return
	}
	item.Updated = now
	item.Updates = append(item.Updates, statusmodel.StatusUpdate{Time: now, Status: item.Status, Message: in.Message})
	_, err = tx.Exec("INSERT INTO status_incidents(id,page_id,document,updated,kind,state,starts,ends) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE document=VALUES(document),updated=VALUES(updated),state=VALUES(state),starts=VALUES(starts),ends=VALUES(ends)", item.ID, p.ID, marshal(item), now, item.Kind, item.Status, item.Start, item.End)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, item)
}
func (a *app) deleteStatusIncident(c *gin.Context) {
	p, ok := a.statusPageFor(c)
	if !ok {
		return
	}
	if _, err := a.db.Exec("DELETE FROM status_incidents WHERE id=? AND page_id=?", c.Param("incident"), p.ID); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (a *app) statusSnapshot(p statusPage) (statusmodel.StatusSnapshot, error) {
	s := p.Settings
	out := statusmodel.StatusSnapshot{Version: 1, Generated: time.Now().Unix(), Title: s.Title, Description: s.Description, Accent: s.Accent, Theme: s.Theme, Website: s.Website, Logo: s.Logo, Footer: s.Footer, Services: []statusmodel.StatusService{}, Incidents: []statusmodel.StatusIncident{}}
	if s.ShowServerStatus {
		var servers []struct {
			ID      string `db:"id"`
			Name    string `db:"name"`
			Seen    int64  `db:"seen"`
			Removed bool   `db:"removed"`
		}
		if err := a.db.Select(&servers, "SELECT n.id,COALESCE(NULLIF(n.display_name,''),n.hostname) AS name,n.seen,EXISTS(SELECT 1 FROM jobs j WHERE j.node_id=n.id AND j.kind='link.uninstall' AND j.status='succeeded') AS removed FROM nodes n JOIN status_page_nodes p ON p.node_id=n.id WHERE p.page_id=? ORDER BY name,n.id", p.ID); err != nil {
			return out, err
		}
		for _, server := range servers {
			state := "outage"
			if server.Seen == 0 {
				state = "unknown"
			} else if !server.Removed && a.linkConnected(server.ID) && out.Generated-server.Seen < 45 {
				state = "operational"
			}
			identity := sha256.Sum256([]byte(p.ID + ":" + server.ID))
			out.Services = append(out.Services, statusmodel.StatusService{ID: "server-" + hex.EncodeToString(identity[:16]), Kind: "server", Name: server.Name, Description: "Server availability via MagnetLink heartbeat", Status: state, Checked: out.Generated, LastSeen: server.Seen, History: []statusmodel.StatusDay{}, HourlyHistory: []statusmodel.StatusHour{}})
		}
	}
	checks := []statusCheck{}
	if err := a.db.Select(&checks, "SELECT c.id,c.name,c.description,c.enabled,c.interval_seconds,c.checked,c.state,c.latency_ms FROM status_checks c JOIN status_page_services m ON m.service_id=c.id WHERE m.page_id=? ORDER BY m.position", p.ID); err != nil {
		return out, err
	}
	var buckets []struct {
		ServiceID string `db:"service_id"`
		statusmodel.StatusDay
	}
	if err := a.db.Select(&buckets, "SELECT b.service_id,b.bucket,b.checks,b.failures,b.latency_ms FROM status_buckets b JOIN status_page_services m ON m.service_id=b.service_id WHERE m.page_id=? AND b.resolution=86400 AND b.bucket>=? ORDER BY b.bucket", p.ID, (out.Generated/86400-89)*86400); err != nil {
		return out, err
	}
	daily := map[string][]statusmodel.StatusDay{}
	for _, b := range buckets {
		daily[b.ServiceID] = append(daily[b.ServiceID], b.StatusDay)
	}
	// The compact five-minute history covers seven days. Aggregate the latest
	// 90 hours for the default public view without adding stored resolutions.
	var hourBuckets []struct {
		ServiceID string `db:"service_id"`
		statusmodel.StatusHour
	}
	if err := a.db.Select(&hourBuckets, "SELECT b.service_id,(b.bucket DIV 3600)*3600 AS bucket,SUM(b.checks) AS checks,SUM(b.failures) AS failures,SUM(b.latency_ms) AS latency_ms FROM status_buckets b JOIN status_page_services m ON m.service_id=b.service_id WHERE m.page_id=? AND b.resolution=300 AND b.bucket>=? GROUP BY b.service_id,(b.bucket DIV 3600)*3600 ORDER BY bucket", p.ID, (out.Generated/3600-89)*3600); err != nil {
		return out, err
	}
	hourly := map[string][]statusmodel.StatusHour{}
	for _, b := range hourBuckets {
		hourly[b.ServiceID] = append(hourly[b.ServiceID], b.StatusHour)
	}
	selected := map[string]bool{}
	for _, c := range checks {
		selected[c.ID] = true
		history := daily[c.ID]
		if history == nil {
			history = []statusmodel.StatusDay{}
		}
		hours := hourly[c.ID]
		if hours == nil {
			hours = []statusmodel.StatusHour{}
		}
		out.Services = append(out.Services, statusmodel.StatusService{ID: c.ID, Name: c.Name, Description: c.Description, Status: c.publicState(), Checked: c.Checked, Latency: c.Latency, History: history, HourlyHistory: hours})
	}
	items, err := a.statusIncidents(p.ID)
	if err != nil {
		return out, err
	}
	for _, item := range items {
		ids := []string{}
		for _, id := range item.Services {
			if selected[id] {
				ids = append(ids, id)
			}
		}
		item.Services = ids
		advanceStatusMaintenance(&item, out.Generated)
		// Bound the public feed; the complete timeline stays in the admin panel.
		if len(item.Updates) > 20 {
			item.Updates = item.Updates[len(item.Updates)-20:]
		}
		out.Incidents = append(out.Incidents, item)
		if statusStage(item.Kind, item.Status) == 3 || item.Status == "scheduled" {
			continue
		}
		for i := range out.Services {
			for _, id := range ids {
				if out.Services[i].ID == id {
					state := item.Impact
					if item.Kind == "maintenance" {
						state = "maintenance"
					}
					if statusSeverity(state) > statusSeverity(out.Services[i].Status) {
						out.Services[i].Status = state
					}
				}
			}
		}
	}
	return out, nil
}
func statusSeverity(state string) int {
	switch state {
	case "outage":
		return 4
	case "maintenance":
		return 3
	case "degraded":
		return 2
	case "unknown":
		return 1
	}
	return 0
}
func (a *app) statusPreview(c *gin.Context) {
	p, ok := a.statusPageFor(c)
	if !ok {
		return
	}
	out, err := a.statusSnapshot(p)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, out)
}
func (a *app) statusFeed(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	// HTTPS may terminate at the configured reverse proxy. Forwarded headers are
	// deliberately not trusted as proof of TLS on an arbitrary direct request.
	if c.Request.TLS == nil && !strings.HasPrefix(a.cfg.PublicURL, "https://") {
		fail(c, 403, errors.New("HTTPS required"))
		return
	}
	var p statusPage
	var stored string
	err := a.db.QueryRow("SELECT id,name,settings,key_hash FROM status_pages WHERE id=?", c.Param("page")).Scan(&p.ID, &p.Name, &p.Raw, &stored)
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	candidate := hash(token)
	if err != nil || stored == "" || subtle.ConstantTimeCompare([]byte(stored), []byte(candidate)) != 1 {
		fail(c, 401, errors.New("invalid status API key"))
		return
	}
	if err = json.Unmarshal([]byte(p.Raw), &p.Settings); err != nil {
		fail(c, 500, errors.New("invalid settings"))
		return
	}
	out, err := a.statusSnapshot(p)
	if err != nil {
		fail(c, 503, errors.New("status data temporarily unavailable"))
		return
	}
	c.JSON(200, out)
}
