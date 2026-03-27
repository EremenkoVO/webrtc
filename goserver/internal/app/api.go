package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"

	"github.com/kelseyhightower/envconfig"
	"github.com/moeryomenko/healing"

	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/handler"
	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/repository/accesstoken"
	"github.com/EremenkoVO/webrtc/goserver/internal/adapter/repository/sqlite"
	"github.com/EremenkoVO/webrtc/goserver/internal/config"
	"github.com/EremenkoVO/webrtc/goserver/internal/db"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
	"github.com/EremenkoVO/webrtc/goserver/internal/pkg/jwt"
	adminService "github.com/EremenkoVO/webrtc/goserver/internal/services/admin"
	authService "github.com/EremenkoVO/webrtc/goserver/internal/services/auth"
	chatService "github.com/EremenkoVO/webrtc/goserver/internal/services/chat"
	presenceService "github.com/EremenkoVO/webrtc/goserver/internal/services/presence"
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
		return fmt.Errorf("process env: %w", err)
	}

	app.db, err = db.New(ctx, app.config.Database)
	if err != nil {
		return fmt.Errorf("init database: %w", err)
	}

	// Initialize repositories
	userRepo := sqlite.NewUserRepository(app.db)
	tokenRepo := sqlite.NewTokenRepository(app.db)
	roomRepo := sqlite.NewRoomRepository(app.db)
	auditRepo := sqlite.NewAuditRepository(app.db)

	// Initialize JWT manager and token cache
	jwtManager := jwt.NewJWTManager(app.config.Auth.TokenSecret)
	accessTokenRepo := accesstoken.NewAccessTokenRepository(ctx)

	// Initialize services
	authSvc := authService.NewAuthService(userRepo, tokenRepo, jwtManager, accessTokenRepo, auditRepo)
	userSvc := userService.NewUserService(userRepo)
	presenceSvc := presenceService.NewPresenceService()
	roomSvc := roomService.NewRoomService(roomRepo, presenceSvc)
	msgRepo := sqlite.NewChatMessageRepository(app.db)
	chatSvc := chatService.NewChatService(msgRepo, userRepo)
	adminSvc := adminService.NewAdminService(userRepo, roomRepo, authSvc, roomSvc, auditRepo)

	// Initialize handlers
	serverWrapper := handler.NewServerWrapper(authSvc, userSvc, roomSvc, chatSvc, presenceSvc, adminSvc, auditRepo, msgRepo, app.config.UploadDir)
	authenticator := handler.NewAuthenticator(authSvc)

	// Setup HTTP server with routes
	apiHandler := api.HandlerWithOptions(serverWrapper, api.StdHTTPServerOptions{
		Middlewares: []api.MiddlewareFunc{authenticator.Middleware},
	})

	// Custom mux for endpoints not in the generated API
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/me/avatar", authenticator.RequireAuth(serverWrapper.UploadAvatar))
	mux.HandleFunc("POST /api/v1/me/password", authenticator.RequireAuth(serverWrapper.ChangePassword))
	mux.HandleFunc("GET /api/v1/avatars/{username}", serverWrapper.GetAvatar)
	mux.HandleFunc("POST /api/v1/chat/{roomId}/voice", authenticator.RequireAuth(serverWrapper.UploadVoiceMessage))
	mux.HandleFunc("GET /api/v1/chat/messages/{id}/voice", serverWrapper.GetVoiceMessage)
	mux.HandleFunc("POST /api/v1/chat/{roomId}/file", authenticator.RequireAuth(serverWrapper.UploadFileMessage))
	mux.HandleFunc("GET /api/v1/chat/files/{id}", serverWrapper.GetFileAttachment)
	// Admin routes
	mux.HandleFunc("GET /api/v1/admin/setup", serverWrapper.GetAdminSetupStatus)
	mux.HandleFunc("POST /api/v1/admin/setup", serverWrapper.PostAdminSetup)
	mux.HandleFunc("GET /api/v1/admin/stats", serverWrapper.RequireAdmin(serverWrapper.GetAdminStats))
	mux.HandleFunc("GET /api/v1/admin/users", serverWrapper.RequireAdmin(serverWrapper.GetAdminUsers))
	mux.HandleFunc("DELETE /api/v1/admin/users/{id}", serverWrapper.RequireAdmin(serverWrapper.DeleteAdminUser))
	mux.HandleFunc("PATCH /api/v1/admin/users/{id}/role", serverWrapper.RequireAdmin(serverWrapper.PatchAdminUserRole))
	mux.HandleFunc("GET /api/v1/admin/rooms", serverWrapper.RequireAdmin(serverWrapper.GetAdminRooms))
	mux.HandleFunc("DELETE /api/v1/admin/rooms/{id}", serverWrapper.RequireAdmin(serverWrapper.DeleteAdminRoom))
	mux.HandleFunc("GET /api/v1/admin/audit", serverWrapper.RequireAdmin(serverWrapper.GetAdminAudit))
	mux.HandleFunc("GET /api/v1/admin/storage", serverWrapper.RequireAdmin(serverWrapper.GetAdminStorage))
	mux.HandleFunc("POST /api/v1/admin/storage/purge", serverWrapper.RequireAdmin(serverWrapper.PurgeStorage))
	mux.Handle("/", apiHandler)

	finalHandler := handler.LoggingMiddleware(handler.CORS(mux))

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
