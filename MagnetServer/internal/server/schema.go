package server

import (
	"context"
	"fmt"
	"time"
)

// MariaDB DDL implicitly commits. Each idempotent table statement is issued
// separately; rerunning after an interrupted setup safely creates missing tables.
func (a *app) schema() error {
	return a.schemaContext(context.Background())
}

func (a *app) schemaContext(parent context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS package_uploads (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 owner CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 name VARCHAR(255) NOT NULL, size BIGINT NOT NULL,
 sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 nodes TEXT NOT NULL, expires BIGINT NOT NULL, INDEX package_expiry(expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS nodes (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 secret_key CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 hostname VARCHAR(255) NOT NULL, os TEXT NOT NULL, arch VARCHAR(32) NOT NULL,
 address VARCHAR(255) NOT NULL, seen BIGINT NOT NULL, metrics MEDIUMTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS icon MEDIUMTEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS enrollments (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 secret_key CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires BIGINT NOT NULL, script BOOLEAN NOT NULL, INDEX enrollments_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS samples (
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sample_time BIGINT NOT NULL, metrics TEXT NOT NULL,
 INDEX samples_node_time (node_id,sample_time), INDEX samples_time (sample_time),
 CONSTRAINT samples_node_fk FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS jobs (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind VARCHAR(64) NOT NULL, arguments MEDIUMTEXT NOT NULL,
 status VARCHAR(16) NOT NULL, output MEDIUMTEXT NOT NULL,
 created BIGINT NOT NULL, updated BIGINT NOT NULL,
 INDEX jobs_node_status (node_id,status,created), INDEX jobs_created (created),
 CONSTRAINT jobs_node_fk FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS alerts (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 name VARCHAR(255) NOT NULL, node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 metric VARCHAR(16) NOT NULL, threshold DOUBLE NOT NULL, url TEXT NOT NULL,
 method VARCHAR(8) NOT NULL, cooldown BIGINT NOT NULL DEFAULT 300, fired BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS events (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 message TEXT NOT NULL, event_time BIGINT NOT NULL, INDEX events_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
	}
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()
	for i, statement := range statements {
		if _, err := a.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize MariaDB schema (table %d): %w", i+1, err)
		}
	}
	var metricsType string
	if err := a.db.GetContext(ctx, &metricsType, "SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nodes' AND COLUMN_NAME='metrics'"); err != nil {
		return err
	}
	if metricsType == "text" {
		if _, err := a.db.ExecContext(ctx, "ALTER TABLE nodes MODIFY COLUMN metrics MEDIUMTEXT NOT NULL"); err != nil {
			return err
		}
	}
	if err := a.statusSchema(ctx); err != nil {
		return err
	}
	if err := a.accountSchema(ctx); err != nil {
		return err
	}
	return a.serverGroupSchema(ctx)
}
