package handler

import (
	"bufio"
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type contextKey string

const (
	contextKeyUserID contextKey = "user_id"
	contextKeyToken  contextKey = "token"
)

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Sec-WebSocket-Protocol")
		w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Pass to next handler
		next.ServeHTTP(w, r)
	})
}

type Authenticator struct {
	authService ports.AuthService
}

func NewAuthenticator(authService ports.AuthService) *Authenticator {
	return &Authenticator{authService: authService}
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if this route requires authentication
		if _, ok := r.Context().Value(api.BearerAuthScopes).([]string); !ok {
			// No authentication required
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		userID, err := a.authService.ValidateToken(r.Context(), token)
		if err != nil {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		// Add user ID and token to context
		ctx := context.WithValue(r.Context(), contextKeyUserID, userID)
		ctx = context.WithValue(ctx, contextKeyToken, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Hijack implements the http.Hijacker interface to support WebSocket upgrades
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{
			ResponseWriter: w,
			statusCode:     200,
		}

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)

		slog.Info("HTTP request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("query", r.URL.RawQuery),
			slog.String("remote_addr", r.RemoteAddr),
			slog.String("user_agent", r.Header.Get("User-Agent")),
			slog.Int("status_code", wrapped.statusCode),
			slog.Duration("duration", duration),
		)
	})
}

// RequireAuth wraps a HandlerFunc with Bearer token authentication.
// Used for custom routes outside the generated oapi-codegen handler.
func (a *Authenticator) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		userID, err := a.authService.ValidateToken(r.Context(), token)
		if err != nil {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), contextKeyUserID, userID)
		ctx = context.WithValue(ctx, contextKeyToken, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func sendAuthError(w http.ResponseWriter, err error) {
	WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(err))
}

// RequireAdmin wraps a HandlerFunc requiring both authentication and admin role.
func (s *ServerWrapper) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")

		// We need authService here — borrow it from the Authenticator via closure in app.go
		// Instead, use the adminService.GetUserRole approach by storing authSvc on ServerWrapper
		userID, err := s.authService.ValidateToken(r.Context(), token)
		if err != nil {
			sendAuthError(w, domain.ErrUnauthorized)
			return
		}

		role, err := s.adminService.GetUserRole(r.Context(), userID)
		if err != nil || role != "admin" {
			WriteErrorResponse(w, http.StatusForbidden, domain.ToErrorResponse(domain.ErrForbidden))
			return
		}

		ctx := context.WithValue(r.Context(), contextKeyUserID, userID)
		ctx = context.WithValue(ctx, contextKeyToken, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}
