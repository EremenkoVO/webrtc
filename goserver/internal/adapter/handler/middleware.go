package handler

import (
	"context"
	"net/http"
	"strings"

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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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

func sendAuthError(w http.ResponseWriter, err error) {
	WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(err))
}
