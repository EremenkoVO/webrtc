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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	body, _ := json.Marshal(resp)
	_, _ = w.Write(body)
}

func WriteErrorResponse(w http.ResponseWriter, status int, resp api.ErrorResponse) {
	WriteJSONResponse(w, status, resp)
}
