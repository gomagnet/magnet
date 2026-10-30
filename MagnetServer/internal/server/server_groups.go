package server

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"sort"
	"strconv"
	"strings"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
)

type serverGroupAccess struct {
	Group string `db:"group_id" json:"group_id"`
	Level string `db:"level" json:"level"`
}

type serverGroup struct {
	ID       string              `db:"id" json:"id"`
	Name     string              `db:"name" json:"name"`
	Color    string              `db:"color" json:"color"`
	Icon     string              `db:"icon" json:"icon"`
	Revision int64               `db:"revision" json:"revision"`
	Nodes    []string            `db:"-" json:"nodes"`
	Access   []serverGroupAccess `db:"-" json:"access"`
}

func (a *app) serverGroupSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS server_groups (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 name VARCHAR(120) NOT NULL UNIQUE, color CHAR(7) NOT NULL,
 icon MEDIUMTEXT NOT NULL, revision BIGINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS server_group_nodes (
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
 FOREIGN KEY (group_id) REFERENCES server_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS server_group_grants (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 server_group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 level VARCHAR(8) NOT NULL,
 CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
 CHECK (level IN ('view','manage')),
 UNIQUE (user_id,server_group_id), UNIQUE (group_id,server_group_id),
 FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE,
 FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE CASCADE,
 FOREIGN KEY (server_group_id) REFERENCES server_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
	}
	for _, statement := range statements {
		if _, err := a.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

// Reserve admin for the file-backed recovery account. Preserve any legacy
// database account's identity, credentials and grants under a distinct username.
func (a *app) reserveAdminUsername(ctx context.Context) error {
	tx, err := a.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	err = tx.GetContext(ctx, &id, "SELECT id FROM account_users WHERE username='admin' FOR UPDATE")
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	base := "former-admin-" + strings.ToLower(id)
	for attempt := 0; attempt < 100; attempt++ {
		name := base
		if attempt > 0 {
			name += "-" + strconv.Itoa(attempt)
		}
		var found int
		if err := tx.GetContext(ctx, &found, "SELECT COUNT(*) FROM account_users WHERE username=?", name); err != nil {
			return err
		}
		if found != 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, "UPDATE account_users SET username=?,revision=revision+1 WHERE id=?", name, id); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		log.Printf("Reserved recovery username admin; existing database account renamed to %q (identity and credentials preserved)", name)
		return nil
	}
	return errors.New("cannot reserve administrator username; rename the existing database account")
}

func (a *app) serverGroupRoutes(api *gin.RouterGroup) {
	api.GET("/server-groups", a.serverGroups)
	admin := api.Group("/server-groups", func(c *gin.Context) {
		if p := currentPrincipal(c); p == nil || !p.Admin {
			fail(c, 403, errors.New("workspace administrator access required"))
			return
		}
		c.Next()
	})
	admin.POST("", a.saveServerGroup)
	admin.PUT("/:group", a.saveServerGroup)
	admin.DELETE("/:group", a.deleteServerGroup)
}

func (a *app) serverGroups(c *gin.Context) {
	p := currentPrincipal(c)
	management := c.Query("manage") == "1"
	if management {
		if !p.Admin {
			fail(c, 403, errors.New("workspace administrator access required"))
			return
		}
		if !a.requireTOTPSetup(c) {
			return
		}
	}
	scope, args := accessSQL(p, "n.node_id", "server")
	where := "1=1"
	if !p.Admin {
		where = "EXISTS(SELECT 1 FROM server_group_nodes n WHERE n.group_id=g.id AND " + scope + ")"
	} else {
		args = nil
	}
	groups := []serverGroup{}
	if err := a.db.Select(&groups, "SELECT g.* FROM server_groups g WHERE "+where+" ORDER BY g.name", args...); err != nil {
		fail(c, 500, err)
		return
	}
	canSeeAccess := management
	for i := range groups {
		group := &groups[i]
		group.Nodes, group.Access = []string{}, []serverGroupAccess{}
		scope, args := accessSQL(p, "node_id", "server")
		if err := a.db.Select(&group.Nodes, "SELECT node_id FROM server_group_nodes WHERE group_id=? AND "+scope+" ORDER BY node_id", append([]any{group.ID}, args...)...); err != nil {
			fail(c, 500, err)
			return
		}
		// Group labels/icons are ordinary inventory metadata. Grant details are
		// available only to administrators who have enrolled an authenticator.
		if canSeeAccess {
			if err := a.db.Select(&group.Access, "SELECT group_id,level FROM server_group_grants WHERE server_group_id=? AND group_id IS NOT NULL ORDER BY group_id", group.ID); err != nil {
				fail(c, 500, err)
				return
			}
		}
	}
	c.JSON(200, groups)
}

func (a *app) saveServerGroup(c *gin.Context) {
	var in serverGroup
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid server group")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 120 || strings.ContainsAny(in.Name, "\r\n\x00") || !statusColor.MatchString(in.Color) || len(in.Nodes) > 1000 || len(in.Access) > 1000 {
		bad(c, "valid group name, color, servers and access rules required")
		return
	}
	if err := validateServerIcon(in.Icon); err != nil {
		bad(c, err.Error())
		return
	}
	id := c.Param("group")
	creating := id == ""
	if creating {
		id = protocol.Secret()
	}
	tx, err := a.db.Beginx()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	if creating {
		if _, err := tx.Exec("INSERT INTO server_groups(id,name,color,icon) VALUES(?,?,?,?)", id, in.Name, in.Color, in.Icon); err != nil {
			bad(c, "cannot create group; name may already exist")
			return
		}
	} else {
		var revision int64
		if tx.Get(&revision, "SELECT revision FROM server_groups WHERE id=? FOR UPDATE", id) != nil {
			fail(c, 404, errors.New("server group not found"))
			return
		}
		if revision != in.Revision {
			fail(c, 409, errors.New("server group changed; reopen its editor"))
			return
		}
		if _, err := tx.Exec("UPDATE server_groups SET name=?,color=?,icon=?,revision=revision+1 WHERE id=?", in.Name, in.Color, in.Icon, id); err != nil {
			bad(c, "cannot save group; name may already exist")
			return
		}
	}
	seen := map[string]bool{}
	sort.Strings(in.Nodes)
	for _, node := range in.Nodes {
		if seen[node] {
			bad(c, "select each server once")
			return
		}
		seen[node] = true
		var found string
		if tx.Get(&found, "SELECT id FROM nodes WHERE id=? FOR UPDATE", node) != nil {
			bad(c, "selected server no longer exists")
			return
		}
		// Invalidate open editors for groups from which this server is moved.
		if _, err := tx.Exec("UPDATE server_groups SET revision=revision+1 WHERE id IN (SELECT group_id FROM server_group_nodes WHERE node_id=? AND group_id<>?)", node, id); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if _, err := tx.Exec("DELETE FROM server_group_nodes WHERE group_id=?", id); err != nil {
		fail(c, 500, err)
		return
	}
	for _, node := range in.Nodes {
		if _, err := tx.Exec("INSERT INTO server_group_nodes(node_id,group_id) VALUES(?,?) ON DUPLICATE KEY UPDATE group_id=VALUES(group_id)", node, id); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if _, err := tx.Exec("DELETE FROM server_group_grants WHERE server_group_id=? AND group_id IS NOT NULL", id); err != nil {
		fail(c, 500, err)
		return
	}
	seen = map[string]bool{}
	for _, grant := range in.Access {
		if seen[grant.Group] || (grant.Level != "view" && grant.Level != "manage") {
			bad(c, "select distinct user groups and View or Manage access")
			return
		}
		seen[grant.Group] = true
		if _, err := tx.Exec("INSERT INTO server_group_grants(id,group_id,server_group_id,level) VALUES(?,?,?,?)", protocol.Secret(), grant.Group, id, grant.Level); err != nil {
			bad(c, "selected user group no longer exists")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "Server group saved: "+in.Name)
	c.JSON(200, gin.H{"id": id})
}

func (a *app) deleteServerGroup(c *gin.Context) {
	revision, err := strconv.ParseInt(c.Query("revision"), 10, 64)
	if err != nil || revision < 1 {
		bad(c, "server group revision required")
		return
	}
	result, err := a.db.Exec("DELETE FROM server_groups WHERE id=? AND revision=?", c.Param("group"), revision)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if n, _ := result.RowsAffected(); n != 1 {
		fail(c, 409, errors.New("server group changed or was removed; refresh before deleting"))
		return
	}
	a.revokeAccountSessions(c)
	a.event("", "Server group deleted; its servers were kept")
	c.JSON(200, gin.H{"ok": true})
}
