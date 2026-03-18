package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/google/uuid"
)

var uuidRe = regexp.MustCompile(`^[0-9a-f-]{36}$`)

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

const maxFileSize = 25 << 20 // 25 MB

// UploadFileMessage handles POST /api/v1/chat/{roomId}/file
func (s *ServerWrapper) UploadFileMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

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

	r.Body = http.MaxBytesReader(w, r.Body, maxFileSize+4096)
	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	file, hdr, err := r.FormFile("file")
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(io.LimitReader(file, maxFileSize))
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	contentType := http.DetectContentType(data)
	// Prefer the browser-declared content type for known formats DetectContentType misidentifies
	if declared := hdr.Header.Get("Content-Type"); declared != "" && contentType == "application/octet-stream" {
		contentType = declared
	}

	if err := os.MkdirAll(s.uploadDir, 0755); err != nil {
		log.Printf("UploadFileMessage: MkdirAll %q failed: %v", s.uploadDir, err)
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	msgID := uuid.NewString()
	filePath := filepath.Join(s.uploadDir, msgID)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("UploadFileMessage: WriteFile %q failed: %v", filePath, err)
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	chatMsg := &domain.ChatMessage{
		ID:              msgID,
		Type:            "file_message",
		Room:            roomID,
		From:            strconv.Itoa(userID),
		Username:        username,
		Timestamp:       time.Now().UTC(),
		Reactions:       map[string][]string{},
		FileURL:         msgID, // stored path (just the ID, uploadDir is server-side)
		FileName:        hdr.Filename,
		FileSize:        int64(len(data)),
		FileContentType: contentType,
	}

	if err := s.msgRepo.StoreFile(r.Context(), chatMsg); err != nil {
		log.Printf("UploadFileMessage: StoreFile failed: %v", err)
		_ = os.Remove(filePath)
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	// Set public URL for broadcast
	chatMsg.FileURL = "/api/v1/chat/files/" + msgID
	s.chatService.BroadcastToRoom(roomID, chatMsg)

	WriteJSONResponse(w, http.StatusCreated, map[string]string{
		"id":  msgID,
		"url": chatMsg.FileURL,
	})
}

// GetFileAttachment handles GET /api/v1/chat/files/{id}
func (s *ServerWrapper) GetFileAttachment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	_, fileName, contentType, err := s.msgRepo.GetFileMeta(r.Context(), id)
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	if fileName == "" {
		WriteErrorResponse(w, http.StatusNotFound, domain.ToErrorResponse(domain.ErrUserNotFound))
		return
	}

	filePath := filepath.Join(s.uploadDir, id)
	f, err := os.Open(filePath)
	if err != nil {
		WriteErrorResponse(w, http.StatusNotFound, domain.ToErrorResponse(domain.ErrUserNotFound))
		return
	}
	defer func() { _ = f.Close() }()

	fi, err := f.Stat()
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	isInline := strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "video/")
	if isInline {
		w.Header().Set("Content-Disposition", "inline")
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	}
	http.ServeContent(w, r, "", fi.ModTime(), f)
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
