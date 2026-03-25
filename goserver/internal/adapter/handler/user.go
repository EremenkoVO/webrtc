package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type directoryUserResponse struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
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
			ID:       strconv.Itoa(e.ID),
			Username: e.Username,
		}
		if e.HasAvatar {
			url := "/api/v1/avatars/" + e.Username
			item.AvatarURL = &url
		}
		resp[i] = item
	}

	WriteJSONResponse(w, http.StatusOK, resp)
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
