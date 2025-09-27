package handler

import (
	"encoding/json"
	"net/http"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
)

// Register new user
// (POST /api/v1/auth/register)
func (s *ServerWrapper) RegisterUser(w http.ResponseWriter, r *http.Request) {
	defer func() {
		_ = r.Body.Close()
	}()

	var req api.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	tokens, err := s.authService.Register(r.Context(), req.Username, req.Password)
	if err != nil {
		statusCode := domain.GetStatusCode(err)
		WriteErrorResponse(w, statusCode, domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusCreated, convertToAuthTokens(tokens))
}

// User login
// (POST /api/v1/auth/login)
func (s *ServerWrapper) LoginUser(w http.ResponseWriter, r *http.Request) {
	var req api.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	tokens, err := s.authService.Login(r.Context(), req.Username, req.Password)
	if err != nil {
		statusCode := domain.GetStatusCode(err)
		WriteErrorResponse(w, statusCode, domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusOK, convertToAuthTokens(tokens))
}

// Refresh access token
// (POST /api/v1/auth/refresh)
func (s *ServerWrapper) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req api.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	tokens, err := s.authService.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		statusCode := domain.GetStatusCode(err)
		WriteErrorResponse(w, statusCode, domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusOK, convertToAuthTokens(tokens))
}

// Logout user
// (POST /api/v1/auth/logout)
func (s *ServerWrapper) LogoutUser(w http.ResponseWriter, r *http.Request) {
	// Extract token from context (set by middleware)
	token, ok := r.Context().Value(contextKeyToken).(string)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	err := s.authService.Logout(r.Context(), token)
	if err != nil {
		statusCode := domain.GetStatusCode(err)
		WriteErrorResponse(w, statusCode, domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Get current user profile
// (GET /api/v1/me)
func (s *ServerWrapper) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	profile, err := s.userService.GetProfile(r.Context(), userID)
	if err != nil {
		statusCode := domain.GetStatusCode(err)
		WriteErrorResponse(w, statusCode, domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusOK, convertToUserProfile(profile))
}
