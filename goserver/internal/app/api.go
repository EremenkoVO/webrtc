package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"

	"github.com/EremenkoVO/webrtc/goserver/internal/config"
	"github.com/EremenkoVO/webrtc/goserver/internal/db"
	"github.com/kelseyhightower/envconfig"
)

const prefix = "mydiscord"

type API struct {
	config config.Config
	db     *sql.DB
}

func (app *API) Init() (init, stop func(context.Context) error) {
	return app.init, app.stop
}

func (app *API) init(ctx context.Context) error {
	err := envconfig.Process(prefix, &app.config)
	if err != nil {
		return fmt.Errorf("failed process env: %w", err)
	}

	app.db, err = db.New(ctx, app.config.Database)
	if err != nil {
		return fmt.Errorf("failed init database: %w", err)
	}

	// TODO:
	// - init services
	// - init server

	return nil
}

func (app *API) stop(ctx context.Context) error {
	// TODO:
	// - close services
	// - close database

	if err := app.db.Close(); err != nil {
		log.Printf("failed close database: %v", err)
	}

	return nil
}

func (app *API) Server() *http.Server {
	return nil
}
