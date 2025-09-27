package db

import (
	"context"
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"

	"github.com/EremenkoVO/webrtc/goserver/internal/config"
	"github.com/EremenkoVO/webrtc/goserver/migrations"
)

func New(ctx context.Context, cfg *config.Database) (*sql.DB, error) {
	db, err := sql.Open("sqlite", cfg.DSN)
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %v", err)
	}

	if err := migrations.Migrate(ctx, db); err != nil {
		return nil, fmt.Errorf("migrations.Migrate: %v", err)
	}

	return db, nil
}
