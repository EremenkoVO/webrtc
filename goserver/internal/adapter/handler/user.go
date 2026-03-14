package handler

import (
	"io"
	"net/http"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

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
