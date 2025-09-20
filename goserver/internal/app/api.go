package app

import (
	"context"
	"net/http"

	"github.com/EremenkoVO/webrtc/goserver/internal/config"
)

type API struct {
	config config.Config
}

func (app *API) Init(ctx context.Context) error {
	// TODO:
	// - init config
	// - init database
	// - init services
	// - init server

	return nil
}

func (app *API) Server() *http.Server {
	return nil
}
