package datastore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"strconv"
	"time"

	"MagnetServer/internal/config"

	"github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

func databaseConnection(cfg config.DatabaseConfig, withDatabase bool) (*sqlx.DB, error) {
	driver := mysql.NewConfig()
	driver.Net = "tcp"
	driver.Addr = net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	driver.User = cfg.User
	driver.Passwd = cfg.Password
	if withDatabase {
		driver.DBName = cfg.Name
	}
	// Params contains SQL system variables, not DSN-only options. Use the
	// driver option so every pooled connection issues SET NAMES correctly.
	if err := driver.Apply(mysql.Charset("utf8mb4", "utf8mb4_unicode_ci")); err != nil {
		return nil, fmt.Errorf("configure MariaDB character set: %w", err)
	}
	driver.Timeout = 10 * time.Second
	driver.ReadTimeout = 30 * time.Second
	driver.WriteTimeout = 30 * time.Second
	if cfg.TLS {
		driver.TLSConfig = "true"
	}
	// Pass credentials directly to the connector; never concatenate a DSN.
	connector, err := mysql.NewConnector(driver)
	if err != nil {
		return nil, errors.New("invalid MariaDB connection configuration")
	}
	db := sqlx.NewDb(sql.OpenDB(connector), "mysql")
	db.SetMaxOpenConns(16)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(3 * time.Minute)
	return db, nil
}

// Open creates and verifies the configured MariaDB connection pool.
func Open(parent context.Context, cfg config.DatabaseConfig) (*sqlx.DB, error) {
	db, err := databaseConnection(cfg, true)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("MariaDB connection failed at %s (database %s): %w", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)), cfg.Name, err)
	}
	return db, nil
}

// Create provisions the configured database after validating its identifier.
func Create(ctx context.Context, cfg config.DatabaseConfig) error {
	if !config.ValidDatabaseName(cfg.Name) {
		return errors.New("invalid database name")
	}
	db, err := databaseConnection(cfg, false)
	if err != nil {
		return err
	}
	defer db.Close()
	// Identifiers cannot use placeholders; the strict name allowlist is checked above.
	_, err = db.ExecContext(ctx, "CREATE DATABASE IF NOT EXISTS `"+cfg.Name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
	if err != nil {
		return fmt.Errorf("create MariaDB database: %w", err)
	}
	return nil
}
