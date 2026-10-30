package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type sessionIdentity struct {
	Picture          string
	User             string
	Provider         string
	PendingMFA       bool
	Authenticated    int64
	UserRevision     int64
	ProviderRevision int64
}
type principal struct {
	Avatar      string            `json:"avatar"`
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Username    string            `json:"username"`
	Viewer      bool              `json:"viewer"`
	Admin       bool              `json:"admin"`
	TOTPOnly    bool              `json:"totp_only"`
	Root        bool              `json:"root"`
	Servers     map[string]string `json:"servers"`
	Monitorings map[string]string `json:"monitorings"`
}

const effectiveMembership = `(m.source='' OR EXISTS(SELECT 1 FROM login_providers p WHERE p.id=m.source AND p.enabled=1 AND p.group_id=m.group_id))`

func currentPrincipal(c *gin.Context) *principal {
	if v, ok := c.Get("principal"); ok {
		p, _ := v.(*principal)
		return p
	}
	return nil
}
func (p *principal) allows(kind, id string, manage bool) bool {
	if p == nil {
		return false
	}
	if p.Admin {
		return true
	}
	level := ""
	if kind == "server" {
		level = p.Servers[id]
	} else if kind == "monitoring" {
		level = p.Monitorings[id]
	}
	return level == "manage" || (!manage && level == "view")
}
func (a *app) requireAccess(c *gin.Context, kind, id string, manage bool) bool {
	if !currentPrincipal(c).allows(kind, id, manage) {
		fail(c, 403, errors.New("access denied"))
		return false
	}
	return true
}
func (a *app) loadPrincipal(identity sessionIdentity) (*principal, error) {
	var row struct {
		ID       string `db:"id"`
		Name     string `db:"name"`
		Username string `db:"username"`
		Admin    bool   `db:"admin"`
		Viewer   bool   `db:"viewer"`
		Revision int64  `db:"revision"`
		TOTPOnly bool   `db:"totp_only"`
	}
	if err := a.db.Get(&row, "SELECT id,name,username,admin,viewer,revision,totp_only FROM account_users WHERE id=? AND enabled=1", identity.User); err != nil {
		return nil, err
	}
	if row.Revision != identity.UserRevision {
		return nil, errors.New("account session revoked")
	}
	if identity.Provider != "" {
		var enabled bool
		if err := a.db.Get(&enabled, "SELECT enabled FROM login_providers WHERE id=? AND revision=?", identity.Provider, identity.ProviderRevision); err != nil || !enabled {
			return nil, errors.New("login provider disabled")
		}
	}
	p := &principal{ID: row.ID, Name: row.Name, Username: row.Username, Admin: row.Admin, Viewer: row.Viewer, TOTPOnly: row.TOTPOnly, Servers: map[string]string{}, Monitorings: map[string]string{}}
	var groupAdmin int
	if err := a.db.Get(&groupAdmin, "SELECT COUNT(*) FROM account_memberships m JOIN account_groups g ON g.id=m.group_id WHERE m.user_id=? AND g.admin=1 AND "+effectiveMembership, row.ID); err != nil {
		return nil, err
	}
	p.Admin = p.Admin || groupAdmin > 0
	var groupViewer int
	if err := a.db.Get(&groupViewer, "SELECT COUNT(*) FROM account_memberships m JOIN account_groups g ON g.id=m.group_id WHERE m.user_id=? AND g.viewer=1 AND "+effectiveMembership, row.ID); err != nil {
		return nil, err
	}
	p.Viewer = p.Viewer || groupViewer > 0
	// Expand the saved Viewer template on every request, including new resources.
	// Existing authorization and list filters use these same effective maps.
	if p.Viewer && !p.Admin {
		for _, resource := range []struct {
			table  string
			grants map[string]string
		}{{"nodes", p.Servers}, {"status_pages", p.Monitorings}} {
			var ids []string
			if err := a.db.Select(&ids, "SELECT id FROM "+resource.table); err != nil {
				return nil, err
			}
			for _, id := range ids {
				resource.grants[id] = "view"
			}
		}
	}
	var grants []struct {
		Node  *string `db:"node_id"`
		Page  *string `db:"page_id"`
		Level string  `db:"level"`
	}
	if err := a.db.Select(&grants, "SELECT node_id,page_id,level FROM account_grants g WHERE g.user_id=? OR g.group_id IN (SELECT m.group_id FROM account_memberships m WHERE m.user_id=? AND "+effectiveMembership+") UNION ALL SELECT n.node_id,NULL AS page_id,g.level FROM server_group_grants g JOIN server_group_nodes n ON n.group_id=g.server_group_id WHERE g.user_id=? OR g.group_id IN (SELECT m.group_id FROM account_memberships m WHERE m.user_id=? AND "+effectiveMembership+")", row.ID, row.ID, row.ID, row.ID); err != nil {
		return nil, err
	}
	for _, g := range grants {
		var target map[string]string
		id := ""
		if g.Node != nil {
			target = p.Servers
			id = *g.Node
		} else if g.Page != nil {
			target = p.Monitorings
			id = *g.Page
		}
		if target != nil && target[id] != "manage" {
			target[id] = g.Level
		}
	}
	// Server grants (including effective group grants) also expose status pages
	// that publish those servers. Inherit view access only: one shared server
	// must not authorize changes to a page containing other servers.
	if len(p.Servers) > 0 {
		scope, args := accessSQL(p, "node_id", "server")
		var pages []string
		if err := a.db.Select(&pages, "SELECT DISTINCT page_id FROM status_page_nodes WHERE "+scope, args...); err != nil {
			return nil, err
		}
		for _, id := range pages {
			if p.Monitorings[id] == "" {
				p.Monitorings[id] = "view"
			}
		}
	}
	return p, nil
}
func (a *app) sessionPrincipal(c *gin.Context) bool {
	token, err := c.Cookie("magnet_session")
	if err != nil || token == "" {
		return false
	}
	digest := hash(token)
	a.mu.Lock()
	expiry, exists := a.sessions[digest]
	identity, identified := a.sessionUsers[digest]
	a.mu.Unlock()
	if !exists || time.Now().After(expiry) || identity.PendingMFA {
		return false
	}
	if !identified {
		c.Set("principal", &principal{ID: "root", Name: "Administrator", Username: "admin", Admin: true, Root: true})
		return true
	}
	p, err := a.loadPrincipal(identity)
	if err != nil {
		return false
	}
	c.Set("principal", p)
	return true
}

// Lists are filtered in their handlers. This gate covers direct object URLs and
// denies every unrecognized endpoint to restricted users by default.
func (a *app) authorizeAPI(c *gin.Context) bool {
	p := currentPrincipal(c)
	if p == nil {
		fail(c, 403, errors.New("access denied"))
		return false
	}
	if p.Admin {
		return true
	}
	path := strings.TrimPrefix(c.Request.URL.Path, "/api/")
	parts := strings.Split(path, "/")
	manage := c.Request.Method != "GET"
	if path == "session" || path == "logout" || path == "security" || strings.HasPrefix(path, "account/") || strings.HasPrefix(path, "security/") {
		return true
	}
	if path == "packages" && c.Request.Method == http.MethodPost {
		// Upload handler validates every target before reading the package body.
		return true
	}
	if path == "server-groups" && c.Request.Method == http.MethodGet {
		return true
	}
	if parts[0] == "nodes" {
		if len(parts) == 1 && !manage {
			return true
		}
		if len(parts) > 1 {
			return a.requireAccess(c, "server", parts[1], manage)
		}
	}
	if parts[0] == "monitorings" {
		if len(parts) == 1 && !manage {
			return true
		}
		if len(parts) > 1 {
			return a.requireAccess(c, "monitoring", parts[1], manage)
		}
	}
	if (path == "status-services" || path == "alerts" || path == "events" || path == "jobs") && !manage {
		return true
	}
	if parts[0] == "jobs" && len(parts) == 2 {
		var node string
		if a.db.Get(&node, "SELECT node_id FROM jobs WHERE id=?", parts[1]) != nil {
			fail(c, 404, errors.New("job not found"))
			return false
		}
		return a.requireAccess(c, "server", node, false)
	}
	// Payload-owned resources require both their old owner and proposed owner.
	if (path == "alerts" || path == "jobs") && c.Request.Method == "POST" {
		var body struct {
			ID    string   `json:"id"`
			Node  string   `json:"node_id"`
			Nodes []string `json:"nodes"`
		}
		raw, err := io.ReadAll(c.Request.Body)
		if err != nil || json.Unmarshal(raw, &body) != nil {
			bad(c, "invalid request")
			return false
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(raw))
		if path == "jobs" {
			if len(body.Nodes) == 0 {
				bad(c, "select servers")
				return false
			}
			for _, id := range body.Nodes {
				if !a.requireAccess(c, "server", id, true) {
					return false
				}
			}
			return true
		}
		if !a.requireAccess(c, "server", body.Node, true) {
			return false
		}
		if body.ID != "" {
			var node string
			table := "alerts"
			err = a.db.Get(&node, "SELECT node_id FROM "+table+" WHERE id=?", body.ID)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				fail(c, 500, errors.New("cannot read resource"))
				return false
			}
			if err == nil && !a.requireAccess(c, "server", node, true) {
				return false
			}
		}
		return true
	}
	if parts[0] == "alerts" && len(parts) == 2 && c.Request.Method == "DELETE" {
		var node string
		table := "alerts"
		if a.db.Get(&node, "SELECT node_id FROM "+table+" WHERE id=?", parts[1]) != nil {
			fail(c, 404, errors.New("resource not found"))
			return false
		}
		return a.requireAccess(c, "server", node, true)
	}
	fail(c, 403, errors.New("workspace administrator access required"))
	return false
}

// Parameterized scope for list queries; always filter before applying LIMIT.
func accessSQL(p *principal, column, kind string, onlyManage ...bool) (string, []any) {
	if p == nil {
		return "1=0", nil
	}
	if p.Admin {
		return "1=1", nil
	}
	ids := p.Servers
	if kind == "monitoring" {
		ids = p.Monitorings
	}
	if len(ids) == 0 {
		return "1=0", nil
	}
	marks := []string{}
	args := []any{}
	for id, level := range ids {
		if len(onlyManage) > 0 && onlyManage[0] && level != "manage" {
			continue
		}
		marks = append(marks, "?")
		args = append(args, id)
	}
	if len(marks) == 0 {
		return "1=0", nil
	}
	return column + " IN (" + strings.Join(marks, ",") + ")", args
}
func (a *app) revokeAccountSessions(c *gin.Context, userIDs ...string) {
	cookie, _ := c.Cookie("magnet_session")
	keep := hash(cookie)
	a.mu.Lock()
	for owner, identity := range a.sessionUsers {
		if len(userIDs) > 0 && identity.User != userIDs[0] {
			continue
		}
		if owner != keep {
			delete(a.sessions, owner)
			delete(a.sessionUsers, owner)
			delete(a.elevated, owner)
		}
	}
	a.mu.Unlock()
}
func (a *app) sessionResponse(c *gin.Context) {
	p := currentPrincipal(c)
	if err := a.db.Get(&p.Avatar, "SELECT image FROM account_avatars WHERE owner=?", p.ID); err != nil && !errors.Is(err, sql.ErrNoRows) {
		fail(c, 500, err)
		return
	}
	body := gin.H{"public_url": a.cfg.PublicURL, "user": p, "totp_enabled": a.accountTOTPEnabled(c)}
	if p.Admin {
		body["database"] = gin.H{"host": a.cfg.Database.Host, "port": a.cfg.Database.Port, "user": a.cfg.Database.User, "name": a.cfg.Database.Name, "tls": a.cfg.Database.TLS}
	}
	c.JSON(http.StatusOK, body)
}
func (a *app) bumpAccountSession(c *gin.Context, user string) {
	token, _ := c.Cookie("magnet_session")
	a.mu.Lock()
	defer a.mu.Unlock()
	id, ok := a.sessionUsers[hash(token)]
	if ok && id.User == user {
		id.UserRevision++
		a.sessionUsers[hash(token)] = id
	}
}
