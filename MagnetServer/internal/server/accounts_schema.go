package server

import "context"

func (a *app) accountSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS account_avatars (owner VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, image MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS account_users (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 username VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 name VARCHAR(200) NOT NULL, email VARCHAR(255) NOT NULL DEFAULT '',
 password_hash VARCHAR(100) NOT NULL DEFAULT '', enabled BOOLEAN NOT NULL,
 admin BOOLEAN NOT NULL DEFAULT 0, security MEDIUMTEXT NOT NULL,
 created BIGINT NOT NULL, revision BIGINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`ALTER TABLE account_users ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1`,
		`ALTER TABLE account_users ADD COLUMN IF NOT EXISTS viewer BOOLEAN NOT NULL DEFAULT 0`,
		`ALTER TABLE account_users ADD COLUMN IF NOT EXISTS totp_only BOOLEAN NOT NULL DEFAULT 0`,
		`CREATE TABLE IF NOT EXISTS account_invites (
 digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 expires BIGINT NOT NULL, INDEX (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`ALTER TABLE account_invites ADD COLUMN IF NOT EXISTS settings MEDIUMTEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS account_invite_enrollments (
 digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 invite_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload MEDIUMTEXT NOT NULL, expires BIGINT NOT NULL, INDEX (expires),
 FOREIGN KEY (invite_digest) REFERENCES account_invites(digest) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS account_groups (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 name VARCHAR(120) NOT NULL UNIQUE, admin BOOLEAN NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS login_providers (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 name VARCHAR(120) NOT NULL, issuer VARCHAR(2000) NOT NULL,
 client_id VARCHAR(500) NOT NULL, secret MEDIUMTEXT NOT NULL,
 enabled BOOLEAN NOT NULL, signup BOOLEAN NOT NULL,
 group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 revision BIGINT NOT NULL DEFAULT 1,
 FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS account_identities (
 provider_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 subject_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 subject VARCHAR(255) NOT NULL,
 user_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (provider_id,subject_hash),
 FOREIGN KEY (provider_id) REFERENCES login_providers(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`ALTER TABLE account_groups ADD COLUMN IF NOT EXISTS viewer BOOLEAN NOT NULL DEFAULT 0`,
		`CREATE TABLE IF NOT EXISTS account_memberships (
 user_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
 PRIMARY KEY (user_id,group_id,source),
 FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE,
 FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS account_grants (
 id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 group_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 node_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 page_id VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 level VARCHAR(8) NOT NULL,
 CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
 CHECK ((node_id IS NOT NULL AND page_id IS NULL) OR (node_id IS NULL AND page_id IS NOT NULL)),
 CHECK (level IN ('view','manage')),
 FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE,
 FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE CASCADE,
 FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
 FOREIGN KEY (page_id) REFERENCES status_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
	}
	for _, s := range statements {
		if _, err := a.db.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return a.reserveAdminUsername(ctx)
}
