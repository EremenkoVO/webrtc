package handler

import (
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/google/uuid"
)

const maxVoiceSize = 5 << 20 // 5 MB

var allowedVoiceTypes = map[string]bool{
	"audio/webm": true,
	"audio/ogg":  true,
	"audio/mp4":  true,
	"audio/mpeg": true,
	"video/webm": true, // browsers sometimes report webm audio as video/webm
}

// UploadVoiceMessage handles POST /api/v1/chat/{roomId}/voice
func (s *ServerWrapper) UploadVoiceMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	// Resolve username from profile
	username := ""
	if profile, err := s.userService.GetProfile(r.Context(), userID); err == nil {
		username = profile.Username
	}
	if username == "" {
		username = strconv.Itoa(userID)
	}

	roomID := r.PathValue("roomId")
	if roomID == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxVoiceSize+4096)
	if err := r.ParseMultipartForm(maxVoiceSize); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	file, hdr, err := r.FormFile("audio")
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(io.LimitReader(file, maxVoiceSize))
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	contentType := http.DetectContentType(data)
	// Fallback to form-declared content type for audio formats DetectContentType doesn't recognise
	if !allowedVoiceTypes[contentType] {
		if ct := hdr.Header.Get("Content-Type"); allowedVoiceTypes[ct] {
			contentType = ct
		} else {
			WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
			return
		}
	}

	durationSec, _ := strconv.ParseFloat(r.FormValue("duration"), 64)

	msgID := uuid.NewString()
	chatMsg := &domain.ChatMessage{
		ID:            msgID,
		Type:          "voice_message",
		Room:          roomID,
		From:          strconv.Itoa(userID),
		Username:      username,
		Text:          "",
		Timestamp:     time.Now().UTC(),
		Reactions:     map[string][]string{},
		VoiceDuration: durationSec,
		VoiceURL:      "/api/v1/chat/messages/" + msgID + "/voice",
	}

	if err := s.msgRepo.StoreVoice(r.Context(), chatMsg, data, contentType); err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	s.chatService.BroadcastToRoom(roomID, chatMsg)

	WriteJSONResponse(w, http.StatusCreated, map[string]string{
		"id":  msgID,
		"url": chatMsg.VoiceURL,
	})
}

// GetVoiceMessage handles GET /api/v1/chat/messages/{id}/voice
func (s *ServerWrapper) GetVoiceMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	data, contentType, err := s.msgRepo.GetVoiceData(r.Context(), id)
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	if data == nil {
		WriteErrorResponse(w, http.StatusNotFound, domain.ToErrorResponse(domain.ErrUserNotFound))
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
