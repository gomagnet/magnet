package server

import "context"

func (a *app) statusSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS status_pages (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 name VARCHAR(120) NOT NULL, settings TEXT NOT NULL, key_hash CHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS status_checks (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 name VARCHAR(120) NOT NULL, description VARCHAR(500) NOT NULL,
 config MEDIUMTEXT NOT NULL, enabled BOOLEAN NOT NULL, interval_seconds INT NOT NULL,
 next_check BIGINT NOT NULL DEFAULT 0, checked BIGINT NOT NULL DEFAULT 0,
 state VARCHAR(20) NOT NULL DEFAULT 'unknown', latency_ms BIGINT NOT NULL DEFAULT 0,
 INDEX status_checks_due (enabled,next_check),
 CONSTRAINT status_checks_node_fk FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS status_page_services (
 page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 service_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 position INT NOT NULL, PRIMARY KEY (page_id,service_id),
 CONSTRAINT status_mapping_page_fk FOREIGN KEY (page_id) REFERENCES status_pages(id) ON DELETE CASCADE,
 CONSTRAINT status_mapping_service_fk FOREIGN KEY (service_id) REFERENCES status_checks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS status_page_nodes (
 page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (page_id,node_id),
 CONSTRAINT status_page_nodes_page_fk FOREIGN KEY (page_id) REFERENCES status_pages(id) ON DELETE CASCADE,
 CONSTRAINT status_page_nodes_node_fk FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS status_buckets (
 service_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 resolution INT NOT NULL, bucket BIGINT NOT NULL, checks BIGINT NOT NULL,
 failures BIGINT NOT NULL, latency_ms BIGINT NOT NULL,
 PRIMARY KEY (service_id,resolution,bucket), INDEX status_buckets_expiry (resolution,bucket),
 CONSTRAINT status_buckets_check_fk FOREIGN KEY (service_id) REFERENCES status_checks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS status_incidents (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 document MEDIUMTEXT NOT NULL, updated BIGINT NOT NULL,
 kind VARCHAR(16) NOT NULL, state VARCHAR(20) NOT NULL,
 starts BIGINT NOT NULL, ends BIGINT NOT NULL,
 INDEX status_incidents_page (page_id,state,updated),
 INDEX status_incidents_schedule (kind,state,starts,ends),
 CONSTRAINT status_incidents_page_fk FOREIGN KEY (page_id) REFERENCES status_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
	}
	for _, s := range statements {
		if _, err := a.db.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return a.migrateStatusOwnership(ctx)
}

// MariaDB DDL commits implicitly. Inspect each step so an interrupted migration
// can resume without replacing page IDs, API keys, selections or check history.
func (a *app) migrateStatusOwnership(ctx context.Context) error {
	var legacy int
	if err := a.db.GetContext(ctx, &legacy, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='status_pages' AND COLUMN_NAME='node_id'"); err != nil {
		return err
	}
	if legacy != 0 {
		if _, err := a.db.ExecContext(ctx, "INSERT IGNORE INTO status_page_nodes(page_id,node_id) SELECT id,node_id FROM status_pages"); err != nil {
			return err
		}
		var constraint int
		if err := a.db.GetContext(ctx, &constraint, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='status_pages' AND CONSTRAINT_NAME='status_pages_node_fk'"); err != nil {
			return err
		}
		if constraint != 0 {
			if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_pages DROP FOREIGN KEY status_pages_node_fk"); err != nil {
				return err
			}
		}
		if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_pages DROP COLUMN node_id"); err != nil {
			return err
		}
	}
	var pageColumn int
	if err := a.db.GetContext(ctx, &pageColumn, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='status_checks' AND COLUMN_NAME='page_id'"); err != nil {
		return err
	}
	if pageColumn == 0 {
		if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_checks ADD COLUMN page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL"); err != nil {
			return err
		}
	}
	var nullable string
	if err := a.db.GetContext(ctx, &nullable, "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='status_checks' AND COLUMN_NAME='node_id'"); err != nil {
		return err
	}
	if nullable != "YES" {
		var fk int
		if err := a.db.GetContext(ctx, &fk, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='status_checks' AND CONSTRAINT_NAME='status_checks_node_fk'"); err != nil {
			return err
		}
		if fk != 0 {
			if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_checks DROP FOREIGN KEY status_checks_node_fk"); err != nil {
				return err
			}
		}
		if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_checks MODIFY node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL"); err != nil {
			return err
		}
	}
	for _, constraint := range []struct{ name, definition string }{
		{"status_checks_node_fk", "FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE"},
		{"status_checks_page_fk", "FOREIGN KEY (page_id) REFERENCES status_pages(id) ON DELETE CASCADE"},
		{"status_checks_owner", "CHECK ((node_id IS NOT NULL AND page_id IS NULL) OR (node_id IS NULL AND page_id IS NOT NULL))"},
	} {
		var exists int
		if err := a.db.GetContext(ctx, &exists, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='status_checks' AND CONSTRAINT_NAME=?", constraint.name); err != nil {
			return err
		}
		if exists == 0 {
			if _, err := a.db.ExecContext(ctx, "ALTER TABLE status_checks ADD CONSTRAINT "+constraint.name+" "+constraint.definition); err != nil {
				return err
			}
		}
	}
	return nil
}
