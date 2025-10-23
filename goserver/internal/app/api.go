package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"

	"github.com/kelseyhightower/envconfig"
	"github.com/moeryomenko/healing"
	"github.com/moeryomenko/healing/checkers"

	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/handler"
	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/repository/accesstoken"
	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/repository/sqlite"
	"github.com/EremenkoVO/webrtc/goserver/internal/config"
	"github.com/EremenkoVO/webrtc/goserver/internal/db"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
	"github.com/EremenkoVO/webrtc/goserver/internal/pkg/jwt"
	authService "github.com/EremenkoVO/webrtc/goserver/internal/services/auth"
	roomService "github.com/EremenkoVO/webrtc/goserver/internal/services/room"
	userService "github.com/EremenkoVO/webrtc/goserver/internal/services/user"
)

const prefix = "mydiscord"

type API struct {
	config     config.Config
	db         *sql.DB
	httpServer *http.Server

	Health *healing.Health
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

	// Add sqlite readiness prober
	app.Health.AddReadyChecker("sqlite", checkers.SQLPoolReadinessChecker(app.db))

	// Initialize repositories
	userRepo := sqlite.NewUserRepository(app.db)
	tokenRepo := sqlite.NewTokenRepository(app.db)

	// Initialize JWT manager and token cache
	jwtManager := jwt.NewJWTManager(app.config.Auth.TokenSecret)
	accessTokenRepo := accesstoken.NewAccessTokenRepository(ctx)

	// Initialize services
	authSvc := authService.NewAuthService(userRepo, tokenRepo, jwtManager, accessTokenRepo)
	userSvc := userService.NewUserService(userRepo)
	roomSvc := roomService.NewRoomService()

	// Initialize handlers
	serverWrapper := handler.NewServerWrapper(authSvc, userSvc, roomSvc)
	authenticator := handler.NewAuthenticator(authSvc)

	// Setup HTTP server with routes
	apiHandler := api.HandlerWithOptions(serverWrapper, api.StdHTTPServerOptions{
		Middlewares: []api.MiddlewareFunc{authenticator.Middleware},
	})

	finalHandler := handler.LoggingMiddleware(handler.CORS(apiHandler))

	app.httpServer = &http.Server{
		Addr:    app.config.ListenAddr(),
		Handler: finalHandler,
	}

	return nil
}

func (app *API) stop(ctx context.Context) error {
	// Shutdown HTTP server gracefully
	if app.httpServer != nil {
		if err := app.httpServer.Shutdown(ctx); err != nil {
			log.Printf("failed shutdown HTTP server: %v", err)
		}
	}

	// Close database
	if app.db != nil {
		if err := app.db.Close(); err != nil {
			log.Printf("failed close database: %v", err)
		}
	}

	return nil
}

func (app *API) Server() *http.Server {
	return app.httpServer
}
