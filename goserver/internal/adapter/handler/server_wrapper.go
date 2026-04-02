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
	authService  ports.AuthService
	userService  ports.UserService
	roomService  ports.RoomService
	chatService  ports.ChatService
	chatNotifySvc ports.ChatNotifyService
	dmService    ports.DirectConversationService
	presenceSvc  ports.PresenceService
	adminService ports.AdminService
	auditRepo    ports.AuditRepository
	msgRepo      ports.ChatMessageRepository
	uploadDir    string
}

func NewServerWrapper(
	authService ports.AuthService,
	userService ports.UserService,
	roomService ports.RoomService,
	chatService ports.ChatService,
	chatNotifySvc ports.ChatNotifyService,
	dmService ports.DirectConversationService,
	presenceSvc ports.PresenceService,
	adminService ports.AdminService,
	auditRepo ports.AuditRepository,
	msgRepo ports.ChatMessageRepository,
	uploadDir string,
) *ServerWrapper {
	return &ServerWrapper{
		authService:  authService,
		userService:  userService,
		roomService:  roomService,
		chatService:  chatService,
		chatNotifySvc: chatNotifySvc,
		dmService:    dmService,
		presenceSvc:  presenceSvc,
		adminService: adminService,
		auditRepo:    auditRepo,
		msgRepo:      msgRepo,
		uploadDir:    uploadDir,
	}
}

// userProfileResponse extends the generated UserProfile with avatar_url and role.
// Used instead of api.UserProfile to avoid editing generated files.
type userProfileResponse struct {
	ID                 string     `json:"id"`
	Username           string     `json:"username"`
	AvatarURL          *string    `json:"avatar_url,omitempty"`
	Role               string     `json:"role"`
	DisplayName        *string    `json:"display_name,omitempty"`
	Bio                *string    `json:"bio,omitempty"`
	StatusText         *string    `json:"status_text,omitempty"`
	StatusEmoji        *string    `json:"status_emoji,omitempty"`
	BannerURL          *string    `json:"banner_url,omitempty"`
	WebsiteURL         *string    `json:"website_url,omitempty"`
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

func convertToUserProfile(profile *domain.User, isSelf bool) userProfileResponse {
	resp := userProfileResponse{
		ID:                 strconv.Itoa(profile.ID),
		Username:           profile.Username,
		Role:               profile.Role,
	}
	if len(profile.AvatarData) > 0 {
		url := "/api/v1/avatars/" + profile.Username
		resp.AvatarURL = &url
	}
	if profile.DisplayName != "" {
		resp.DisplayName = &profile.DisplayName
	}
	if profile.StatusText != "" {
		resp.StatusText = &profile.StatusText
	}
	if profile.StatusEmoji != "" {
		resp.StatusEmoji = &profile.StatusEmoji
	}
	if profile.BannerURL != "" {
		resp.BannerURL = &profile.BannerURL
	}
	if profile.Bio != "" {
		resp.Bio = &profile.Bio
	}
	if profile.WebsiteURL != "" {
		resp.WebsiteURL = &profile.WebsiteURL
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
