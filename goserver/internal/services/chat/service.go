package chat

import (
	"context"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type chatRoom struct {
	clients map[string]*domain.ChatClient // keyed by ConnID
	mu      sync.RWMutex
}

type Service struct {
	rooms      map[string]*chatRoom
	roomsMu    sync.RWMutex
	msgRepo    ports.ChatMessageRepository
	userRepo   ports.UserRepository
	dmSvc      ports.DirectConversationService
	notifySvc  ports.ChatNotifyService
}

func NewChatService(msgRepo ports.ChatMessageRepository, userRepo ports.UserRepository, dmSvc ports.DirectConversationService, notifySvc ports.ChatNotifyService) *Service {
	return &Service{
		rooms:     make(map[string]*chatRoom),
		msgRepo:   msgRepo,
		userRepo:  userRepo,
		dmSvc:     dmSvc,
		notifySvc: notifySvc,
	}
}

func scopeKey(scopeType, scopeID string) string {
	return scopeType + ":" + scopeID
}

func (s *Service) getOrCreateRoom(scopeType, scopeID string) *chatRoom {
	s.roomsMu.Lock()
	defer s.roomsMu.Unlock()
	key := scopeKey(scopeType, scopeID)
	if r, ok := s.rooms[key]; ok {
		return r
	}
	r := &chatRoom{clients: make(map[string]*domain.ChatClient)}
	s.rooms[key] = r
	return r
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, userID int, username, scopeType, scopeID string) {
	ctx := context.Background()
	if scopeType == "dm" && s.dmSvc != nil {
		ok, err := s.dmSvc.IsParticipant(ctx, userID, scopeID)
		if err != nil || !ok {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "conversation not found"})
			_ = conn.Close()
			return
		}
	}

	client := &domain.ChatClient{
		ConnID:   uuid.NewString(),
		UserID:   userID,
		Username: username,
		ScopeType: scopeType,
		ScopeID:   scopeID,
		Conn:     conn,
	}

	room := s.getOrCreateRoom(scopeType, scopeID)

	room.mu.Lock()
	room.clients[client.ConnID] = client
	room.mu.Unlock()

	userIDStr := strconv.Itoa(userID)

	// Send join confirmation
	_ = conn.WriteJSON(map[string]any{
		"type":      "joined",
		"room":      scopeID,
		"clientId":  client.ConnID,
		"userId":    userIDStr,
		"username":  username,
		"timestamp": time.Now().UTC(),
	})

	// Send chat history from DB
	history, err := s.msgRepo.ListByScope(ctx, scopeType, scopeID, 100)
	if err != nil {
		log.Printf("chat history load: %v", err)
	}
	if len(history) > 0 {
		s.hydrateOutboundMessages(ctx, history)
		_ = conn.WriteJSON(map[string]any{
			"type":     "chat_history",
			"room":     scopeID,
			"messages": history,
		})
	}

	// Notify others
	s.broadcastExcept(room, map[string]any{
		"type":      "user_joined",
		"room":      scopeID,
		"clientId":  client.ConnID,
		"username":  username,
		"timestamp": time.Now().UTC(),
	}, client.ConnID)

	defer func() {
		room.mu.Lock()
		delete(room.clients, client.ConnID)
		room.mu.Unlock()
		_ = conn.Close()

		s.broadcastExcept(room, map[string]any{
			"type":      "user_left",
			"room":      scopeID,
			"clientId":  client.ConnID,
			"username":  username,
			"timestamp": time.Now().UTC(),
		}, client.ConnID)
	}()

	// Read pump
	for {
		var msg map[string]any
		if err := conn.ReadJSON(&msg); err != nil {
			log.Printf("chat read: %v", err)
			return
		}

		msgType, _ := msg["type"].(string)
		switch msgType {
		case "chat_message":
			text, _ := msg["text"].(string)
			if text == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message text is required"})
				continue
			}
			chatMsg := &domain.ChatMessage{
				ID:        uuid.NewString(),
				Type:      "chat_message",
				Room:      scopeID,
				ScopeType: scopeType,
				ScopeID:   scopeID,
				From:      userIDStr,
				Username:  username,
				Text:      text,
				Timestamp: time.Now().UTC(),
				Edited:    false,
				Reactions: map[string][]string{},
			}
			if replyToID, _ := msg["replyToId"].(string); replyToID != "" {
				ref, err := s.msgRepo.GetByID(ctx, replyToID)
				if err != nil {
					log.Printf("chat reply lookup: %v", err)
				}
				if ref != nil {
					chatMsg.ReplyToID = ref.ID
					chatMsg.ReplyToUsername = ref.Username
					preview := []rune(ref.Text)
					if len(preview) > 80 {
						chatMsg.ReplyToText = string(preview[:80]) + "…"
					} else {
						chatMsg.ReplyToText = ref.Text
					}
				}
			}
			if err := s.msgRepo.Store(ctx, chatMsg); err != nil {
				log.Printf("chat store: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save message"})
				continue
			}
			s.BroadcastToScope(scopeType, scopeID, chatMsg)

		case "typing":
			isTyping := true
			if v, ok := msg["isTyping"].(bool); ok {
				isTyping = v
			}
			s.broadcastExcept(room, map[string]any{
				"type":     "typing",
				"room":     scopeID,
				"from":     client.ConnID,
				"username": username,
				"isTyping": isTyping,
			}, client.ConnID)

		case "edit_message":
			messageID, _ := msg["messageId"].(string)
			newText, _ := msg["text"].(string)
			if messageID == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID is required"})
				continue
			}
			if newText == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message text is required"})
				continue
			}
			owner, err := s.msgRepo.GetOwner(ctx, messageID)
			if err != nil {
				log.Printf("chat edit owner: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if owner == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if owner != userIDStr {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "You can only edit your own messages"})
				continue
			}
			if err := s.msgRepo.UpdateText(ctx, messageID, newText); err != nil {
				log.Printf("chat edit update: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to edit message"})
				continue
			}
			s.broadcastAll(room, map[string]any{
				"type":      "message_edited",
				"room":      scopeID,
				"messageId": messageID,
				"text":      newText,
				"timestamp": time.Now().UTC(),
			})

		case "delete_message":
			messageID, _ := msg["messageId"].(string)
			if messageID == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID is required"})
				continue
			}
			owner, err := s.msgRepo.GetOwner(ctx, messageID)
			if err != nil {
				log.Printf("chat delete owner: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if owner == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if owner != userIDStr {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "You can only delete your own messages"})
				continue
			}
			if err := s.msgRepo.Delete(ctx, messageID); err != nil {
				log.Printf("chat delete: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to delete message"})
				continue
			}
			s.broadcastAll(room, map[string]any{
				"type":      "message_deleted",
				"room":      scopeID,
				"messageId": messageID,
			})

		case "add_reaction":
			messageID, _ := msg["messageId"].(string)
			emoji, _ := msg["emoji"].(string)
			if messageID == "" || emoji == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID and emoji are required"})
				continue
			}
			target, err := s.msgRepo.GetByID(ctx, messageID)
			if err != nil || target == nil {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if target.Reactions == nil {
				target.Reactions = map[string][]string{}
			}
			if err := s.normalizeReactionMapInPlace(ctx, target.Reactions); err != nil {
				log.Printf("chat add_reaction normalize: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save reaction"})
				continue
			}
			if !reactionListContainsUser(target.Reactions[emoji], username, userIDStr) {
				target.Reactions[emoji] = append(target.Reactions[emoji], username)
			}
			if err := s.msgRepo.UpdateReactions(ctx, messageID, target.Reactions); err != nil {
				log.Printf("chat add_reaction: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save reaction"})
				continue
			}
			s.broadcastAll(room, map[string]any{
				"type":      "reaction_updated",
				"room":      scopeID,
				"messageId": messageID,
				"emoji":     emoji,
				"reactions": target.Reactions,
			})

		case "remove_reaction":
			messageID, _ := msg["messageId"].(string)
			emoji, _ := msg["emoji"].(string)
			if messageID == "" || emoji == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID and emoji are required"})
				continue
			}
			target, err := s.msgRepo.GetByID(ctx, messageID)
			if err != nil || target == nil {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if target.Reactions != nil {
				if err := s.normalizeReactionMapInPlace(ctx, target.Reactions); err != nil {
					log.Printf("chat remove_reaction normalize: %v", err)
					_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save reaction"})
					continue
				}
				target.Reactions[emoji] = removeUserFromReactionList(target.Reactions[emoji], username, userIDStr)
				if len(target.Reactions[emoji]) == 0 {
					delete(target.Reactions, emoji)
				}
			}
			if err := s.msgRepo.UpdateReactions(ctx, messageID, target.Reactions); err != nil {
				log.Printf("chat remove_reaction: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save reaction"})
				continue
			}
			s.broadcastAll(room, map[string]any{
				"type":      "reaction_updated",
				"room":      scopeID,
				"messageId": messageID,
				"emoji":     emoji,
				"reactions": target.Reactions,
			})

		case "voice_recording":
			isRec, _ := msg["isRecording"].(bool)
			s.broadcastExcept(room, map[string]any{
				"type":        "voice_recording",
				"room":        scopeID,
				"username":    username,
				"isRecording": isRec,
			}, client.ConnID)

		default:
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Unknown message type: " + msgType})
		}
	}
}

func (s *Service) BroadcastToScope(scopeType, scopeID string, msg any) {
	if cm, ok := msg.(*domain.ChatMessage); ok {
		s.hydrateOutboundMessages(context.Background(), []*domain.ChatMessage{cm})
		s.publishNotification(context.Background(), cm)
	}
	s.roomsMu.RLock()
	room, ok := s.rooms[scopeKey(scopeType, scopeID)]
	s.roomsMu.RUnlock()
	if ok {
		s.broadcastAll(room, msg)
	}
}

func (s *Service) publishNotification(ctx context.Context, msg *domain.ChatMessage) {
	if s.notifySvc == nil || msg == nil {
		return
	}
	senderID, err := strconv.Atoi(msg.From)
	if err != nil {
		return
	}
	recipients := s.notificationRecipients(ctx, msg.ScopeType, msg.ScopeID, senderID)
	if len(recipients) == 0 {
		return
	}
	text := msg.Text
	if text == "" {
		switch msg.Type {
		case "voice_message":
			text = "[Voice message]"
		case "file_message":
			text = "[File attachment]"
		}
	}
	s.notifySvc.NotifyUsers(recipients, ports.ChatNotification{
		ScopeType:    msg.ScopeType,
		ScopeID:      msg.ScopeID,
		FromUserID:   msg.From,
		FromUsername: msg.Username,
		Type:         msg.Type,
		TextPreview:  text,
		Timestamp:    msg.Timestamp.Format(time.RFC3339),
	})
}

func (s *Service) notificationRecipients(ctx context.Context, scopeType, scopeID string, senderID int) []int {
	if scopeType == "dm" && s.dmSvc != nil {
		conv, err := s.dmSvc.Get(ctx, senderID, scopeID)
		if err == nil && conv != nil {
			out := make([]int, 0, len(conv.Participants))
			for _, p := range conv.Participants {
				if p.UserID != senderID {
					out = append(out, p.UserID)
				}
			}
			return out
		}
	}
	if s.userRepo == nil {
		return nil
	}
	users, err := s.userRepo.ListUsers(ctx)
	if err != nil {
		return nil
	}
	out := make([]int, 0, len(users))
	for _, u := range users {
		if u != nil && u.ID != senderID {
			out = append(out, u.ID)
		}
	}
	return out
}

func (s *Service) broadcastAll(room *chatRoom, msg any) {
	room.mu.RLock()
	defer room.mu.RUnlock()
	for _, c := range room.clients {
		if err := c.Conn.WriteJSON(msg); err != nil {
			log.Printf("chat write: %v", err)
		}
	}
}

func (s *Service) broadcastExcept(room *chatRoom, msg any, exceptConnID string) {
	room.mu.RLock()
	defer room.mu.RUnlock()
	for connID, c := range room.clients {
		if connID == exceptConnID {
			continue
		}
		if err := c.Conn.WriteJSON(msg); err != nil {
			log.Printf("chat write: %v", err)
		}
	}
}

