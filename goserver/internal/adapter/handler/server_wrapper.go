package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type ServerWrapper struct {
	authService ports.AuthService
	userService ports.UserService
	roomService ports.RoomService
}

func NewServerWrapper(
	authService ports.AuthService,
	userService ports.UserService,
	roomService ports.RoomService,
) *ServerWrapper {
	return &ServerWrapper{
		authService: authService,
		userService: userService,
		roomService: roomService,
	}
}

// userProfileResponse extends the generated UserProfile with avatar_url.
// Used instead of api.UserProfile to avoid editing generated files.
type userProfileResponse struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
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

func convertToUserProfile(profile *domain.User) userProfileResponse {
	resp := userProfileResponse{
		ID:       strconv.Itoa(profile.ID),
		Username: profile.Username,
	}
	if len(profile.AvatarData) > 0 {
		url := "/api/v1/avatars/" + profile.Username
		resp.AvatarURL = &url
	}
	return resp
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
