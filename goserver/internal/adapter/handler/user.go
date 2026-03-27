package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type updateProfileRequest struct {
	DisplayName        string `json:"display_name"`
	Bio                string `json:"bio"`
	StatusText         string `json:"status_text"`
	StatusEmoji        string `json:"status_emoji"`
	BannerURL          string `json:"banner_url"`
	WebsiteURL         string `json:"website_url"`
}

type directoryUserResponse struct {
	ID         string     `json:"id"`
	Username   string     `json:"username"`
	DisplayName *string   `json:"display_name,omitempty"`
	AvatarURL  *string    `json:"avatar_url,omitempty"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
}

// ListServerUsers handles GET /api/v1/users
func (s *ServerWrapper) ListServerUsers(w http.ResponseWriter, r *http.Request) {
	_, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	entries, err := s.userService.ListPublicDirectory(r.Context())
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	resp := make([]directoryUserResponse, len(entries))
	for i, e := range entries {
		item := directoryUserResponse{
			ID:         strconv.Itoa(e.ID),
			Username:   e.Username,
			LastSeenAt: e.LastSeenAt,
		}
		if e.DisplayName != "" {
			item.DisplayName = &e.DisplayName
		}
		if e.HasAvatar {
			url := "/api/v1/avatars/" + e.Username
			item.AvatarURL = &url
		}
		resp[i] = item
	}

	WriteJSONResponse(w, http.StatusOK, resp)
}

// UpdateCurrentUserProfile handles PATCH /api/v1/me
func (s *ServerWrapper) UpdateCurrentUserProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	updated, err := s.userService.UpdateProfile(r.Context(), userID, &domain.User{
		DisplayName:        req.DisplayName,
		Bio:                req.Bio,
		StatusText:         req.StatusText,
		StatusEmoji:        req.StatusEmoji,
		BannerURL:          req.BannerURL,
		WebsiteURL:         req.WebsiteURL,
	})
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusOK, convertToUserProfile(updated, true))
}

// GetPublicUserProfile handles GET /api/v1/users/{username}/profile
func (s *ServerWrapper) GetPublicUserProfile(w http.ResponseWriter, r *http.Request, username string) {
	if username == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	profile, err := s.userService.GetPublicProfileByUsername(r.Context(), username)
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}
	WriteJSONResponse(w, http.StatusOK, convertToUserProfile(profile, false))
}

// ChangePassword handles POST /api/v1/me/password
func (s *ServerWrapper) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	if err := s.userService.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

const maxAvatarSize = 5 << 20 // 5 MB

var allowedAvatarTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// UploadAvatar handles POST /api/v1/me/avatar
func (s *ServerWrapper) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarSize+4096)
	if err := r.ParseMultipartForm(maxAvatarSize); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	file, _, err := r.FormFile("avatar")
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(io.LimitReader(file, maxAvatarSize))
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	contentType := http.DetectContentType(data)
	if !allowedAvatarTypes[contentType] {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	if err := s.userService.UploadAvatar(r.Context(), userID, data, contentType); err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAvatar handles GET /api/v1/avatars/{username}
func (s *ServerWrapper) GetAvatar(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	if username == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	data, contentType, err := s.userService.GetAvatar(r.Context(), username)
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
