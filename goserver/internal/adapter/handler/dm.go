package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
)

func toAPIDirectConversation(conv *domain.DirectConversation) api.DirectConversation {
	out := api.DirectConversation{
		Id:        conv.ID,
		CreatedAt: conv.CreatedAt,
	}
	if !conv.UpdatedAt.IsZero() {
		out.UpdatedAt = &conv.UpdatedAt
	}
	unread := conv.UnreadCount
	out.UnreadCount = &unread
	if conv.LastMessage != nil {
		out.LastMessage = &api.ChatMessage{
			Id:              &conv.LastMessage.ID,
			Type:            &conv.LastMessage.Type,
			Room:            &conv.LastMessage.Room,
			From:            &conv.LastMessage.From,
			Username:        &conv.LastMessage.Username,
			Text:            &conv.LastMessage.Text,
			Timestamp:       &conv.LastMessage.Timestamp,
			Edited:          &conv.LastMessage.Edited,
			Reactions:       &conv.LastMessage.Reactions,
			ReplyToId:       &conv.LastMessage.ReplyToID,
			ReplyToUsername: &conv.LastMessage.ReplyToUsername,
			ReplyToText:     &conv.LastMessage.ReplyToText,
			VoiceUrl:        &conv.LastMessage.VoiceURL,
			FileUrl:         &conv.LastMessage.FileURL,
			FileName:        &conv.LastMessage.FileName,
			FileContentType: &conv.LastMessage.FileContentType,
		}
		fileSize := int(conv.LastMessage.FileSize)
		out.LastMessage.FileSize = &fileSize
		voiceDuration := float32(conv.LastMessage.VoiceDuration)
		out.LastMessage.VoiceDuration = &voiceDuration
	}
	out.Participants = make([]api.DirectConversationParticipant, 0, len(conv.Participants))
	for _, p := range conv.Participants {
		pp := api.DirectConversationParticipant{
			UserId:   strconv.Itoa(p.UserID),
			Username: p.Username,
		}
		if p.DisplayName != "" {
			pp.DisplayName = &p.DisplayName
		}
		out.Participants = append(out.Participants, pp)
	}
	return out
}

func (s *ServerWrapper) ListDirectConversations(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}
	convs, err := s.dmService.ListByUserID(r.Context(), userID)
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	resp := make([]api.DirectConversation, 0, len(convs))
	for _, c := range convs {
		resp = append(resp, toAPIDirectConversation(c))
	}
	WriteJSONResponse(w, http.StatusOK, resp)
}

func (s *ServerWrapper) CreateOrGetDirectConversation(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}
	var req api.CreateOrGetDirectConversationJSONRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PeerUserId == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	peerUserID, err := strconv.Atoi(req.PeerUserId)
	if err != nil || peerUserID <= 0 || peerUserID == userID {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}
	conv, created, err := s.dmService.CreateOrGet(r.Context(), userID, peerUserID)
	if err != nil || conv == nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	WriteJSONResponse(w, status, toAPIDirectConversation(conv))
}

func (s *ServerWrapper) GetDirectConversation(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}
	ok, err := s.dmService.IsParticipant(r.Context(), userID, id)
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	if !ok {
		WriteErrorResponse(w, http.StatusNotFound, domain.ToErrorResponse(domain.ErrUserNotFound))
		return
	}
	conv, err := s.dmService.Get(r.Context(), userID, id)
	if err != nil || conv == nil {
		WriteErrorResponse(w, http.StatusNotFound, domain.ToErrorResponse(domain.ErrUserNotFound))
		return
	}
	WriteJSONResponse(w, http.StatusOK, toAPIDirectConversation(conv))
}
