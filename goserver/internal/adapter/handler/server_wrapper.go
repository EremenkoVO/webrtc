package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
	"github.com/EremenkoVO/webrtc/goserver/internal/pkg/utils"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type ServerWrapper struct {
	authService ports.AuthService
	userService ports.UserService
}

func NewServerWrapper(authService ports.AuthService, userService ports.UserService) *ServerWrapper {
	return &ServerWrapper{
		authService: authService,
		userService: userService,
	}
}

// Implement the generated ServerInterface
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

// Conversion functions
func convertToAuthTokens(tokens *domain.AuthTokens) api.AuthTokens {
	return api.AuthTokens{
		AccessToken:      &tokens.AccessToken,
		RefreshToken:     &tokens.RefreshToken,
		ExpiresIn:        &tokens.ExpiresIn,
		RefreshExpiresIn: &tokens.RefreshExpiresIn,
	}
}

func convertToUserProfile(profile *domain.User) api.UserProfile {
	return api.UserProfile{
		Id:       utils.ToPtr(strconv.Itoa(profile.ID)),
		Username: &profile.Username,
	}
}

func WriteJSONResponse[T any](w http.ResponseWriter, status int, resp T) {
	w.WriteHeader(status)
	w.Header().Set("Content-Type", "application/json")
	body, _ := json.Marshal(resp)
	_, _ = w.Write(body)
}

func WriteErrorResponse(w http.ResponseWriter, status int, resp api.ErrorResponse) {
	WriteJSONResponse(w, status, resp)
}
