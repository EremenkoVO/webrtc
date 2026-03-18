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
	rooms   map[string]*chatRoom
	roomsMu sync.RWMutex
	msgRepo ports.ChatMessageRepository
}

func NewChatService(msgRepo ports.ChatMessageRepository) *Service {
	return &Service{
		rooms:   make(map[string]*chatRoom),
		msgRepo: msgRepo,
	}
}

func (s *Service) getOrCreateRoom(roomID string) *chatRoom {
	s.roomsMu.Lock()
	defer s.roomsMu.Unlock()
	if r, ok := s.rooms[roomID]; ok {
		return r
	}
	r := &chatRoom{clients: make(map[string]*domain.ChatClient)}
	s.rooms[roomID] = r
	return r
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, userID int, username, roomID string) {
	ctx := context.Background()

	client := &domain.ChatClient{
		ConnID:   uuid.NewString(),
		UserID:   userID,
		Username: username,
		RoomID:   roomID,
		Conn:     conn,
	}

	room := s.getOrCreateRoom(roomID)

	room.mu.Lock()
	room.clients[client.ConnID] = client
	room.mu.Unlock()

	userIDStr := strconv.Itoa(userID)

	// Send join confirmation
	_ = conn.WriteJSON(map[string]any{
		"type":      "joined",
		"room":      roomID,
		"clientId":  client.ConnID,
		"userId":    userIDStr,
		"username":  username,
		"timestamp": time.Now().UTC(),
	})

	// Send chat history from DB
	history, err := s.msgRepo.ListByRoom(ctx, roomID, 100)
	if err != nil {
		log.Printf("chat history load: %v", err)
	}
	if len(history) > 0 {
		_ = conn.WriteJSON(map[string]any{
			"type":     "chat_history",
			"room":     roomID,
			"messages": history,
		})
	}

	// Notify others
	s.broadcastExcept(room, map[string]any{
		"type":      "user_joined",
		"room":      roomID,
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
			"room":      roomID,
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
				Room:      roomID,
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
			s.broadcastAll(room, chatMsg)

		case "typing":
			isTyping := true
			if v, ok := msg["isTyping"].(bool); ok {
				isTyping = v
			}
			s.broadcastExcept(room, map[string]any{
				"type":     "typing",
				"room":     roomID,
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
				"room":      roomID,
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
				"room":      roomID,
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
			if !containsStr(target.Reactions[emoji], username) {
				target.Reactions[emoji] = append(target.Reactions[emoji], username)
			}
			if err := s.msgRepo.UpdateReactions(ctx, messageID, target.Reactions); err != nil {
				log.Printf("chat add_reaction: %v", err)
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Failed to save reaction"})
				continue
			}
			s.broadcastAll(room, map[string]any{
				"type":      "reaction_updated",
				"room":      roomID,
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
				target.Reactions[emoji] = filterStr(target.Reactions[emoji], username)
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
				"room":      roomID,
				"messageId": messageID,
				"emoji":     emoji,
				"reactions": target.Reactions,
			})

		case "voice_recording":
			isRec, _ := msg["isRecording"].(bool)
			s.broadcastExcept(room, map[string]any{
				"type":        "voice_recording",
				"room":        roomID,
				"username":    username,
				"isRecording": isRec,
			}, client.ConnID)

		default:
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Unknown message type: " + msgType})
		}
	}
}

func (s *Service) BroadcastToRoom(roomID string, msg any) {
	s.roomsMu.RLock()
	room, ok := s.rooms[roomID]
	s.roomsMu.RUnlock()
	if ok {
		s.broadcastAll(room, msg)
	}
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

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func filterStr(slice []string, remove string) []string {
	result := slice[:0]
	for _, v := range slice {
		if v != remove {
			result = append(result, v)
		}
	}
	return result
}
