package chat

import (
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

const maxMessages = 1000

type chatRoom struct {
	clients  map[string]*domain.ChatClient // keyed by ConnID
	messages []*domain.ChatMessage
	mu       sync.RWMutex
}

type Service struct {
	rooms   map[string]*chatRoom
	roomsMu sync.RWMutex
}

func NewChatService() *Service {
	return &Service{
		rooms: make(map[string]*chatRoom),
	}
}

func (s *Service) getOrCreateRoom(roomID string) *chatRoom {
	s.roomsMu.Lock()
	defer s.roomsMu.Unlock()
	if r, ok := s.rooms[roomID]; ok {
		return r
	}
	r := &chatRoom{
		clients:  make(map[string]*domain.ChatClient),
		messages: make([]*domain.ChatMessage, 0),
	}
	s.rooms[roomID] = r
	return r
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, userID int, username, roomID string) {
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

	// Send chat history (last 100)
	room.mu.RLock()
	msgs := room.messages
	start := 0
	if len(msgs) > 100 {
		start = len(msgs) - 100
	}
	history := make([]*domain.ChatMessage, len(msgs[start:]))
	copy(history, msgs[start:])
	room.mu.RUnlock()

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
			room.mu.Lock()
			room.messages = append(room.messages, chatMsg)
			if len(room.messages) > maxMessages {
				room.messages = room.messages[1:]
			}
			room.mu.Unlock()
			s.broadcastAll(room, chatMsg)

		case "typing":
			isTyping := true
			if v, ok := msg["isTyping"].(bool); ok {
				isTyping = v
			}
			s.broadcastExcept(room, map[string]any{
				"type":      "typing",
				"room":      roomID,
				"from":      client.ConnID,
				"username":  username,
				"isTyping":  isTyping,
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
			room.mu.Lock()
			target := findMessage(room.messages, messageID)
			if target == nil {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if target.From != userIDStr {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "You can only edit your own messages"})
				continue
			}
			target.Text = newText
			target.Edited = true
			room.mu.Unlock()
			s.broadcastAll(room, map[string]any{
				"type":      "message_edited",
				"room":      roomID,
				"messageId": target.ID,
				"text":      newText,
				"timestamp": time.Now().UTC(),
			})

		case "delete_message":
			messageID, _ := msg["messageId"].(string)
			if messageID == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID is required"})
				continue
			}
			room.mu.Lock()
			idx := findMessageIndex(room.messages, messageID)
			if idx == -1 {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if room.messages[idx].From != userIDStr {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "You can only delete your own messages"})
				continue
			}
			deletedID := room.messages[idx].ID
			room.messages = append(room.messages[:idx], room.messages[idx+1:]...)
			room.mu.Unlock()
			s.broadcastAll(room, map[string]any{
				"type":      "message_deleted",
				"room":      roomID,
				"messageId": deletedID,
			})

		case "add_reaction":
			messageID, _ := msg["messageId"].(string)
			emoji, _ := msg["emoji"].(string)
			if messageID == "" || emoji == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID and emoji are required"})
				continue
			}
			room.mu.Lock()
			target := findMessage(room.messages, messageID)
			if target == nil {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if target.Reactions == nil {
				target.Reactions = map[string][]string{}
			}
			if !containsStr(target.Reactions[emoji], userIDStr) {
				target.Reactions[emoji] = append(target.Reactions[emoji], userIDStr)
			}
			reactions := copyReactions(target.Reactions)
			msgID := target.ID
			room.mu.Unlock()
			s.broadcastAll(room, map[string]any{
				"type":      "reaction_updated",
				"room":      roomID,
				"messageId": msgID,
				"emoji":     emoji,
				"reactions": reactions,
			})

		case "remove_reaction":
			messageID, _ := msg["messageId"].(string)
			emoji, _ := msg["emoji"].(string)
			if messageID == "" || emoji == "" {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message ID and emoji are required"})
				continue
			}
			room.mu.Lock()
			target := findMessage(room.messages, messageID)
			if target == nil {
				room.mu.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Message not found"})
				continue
			}
			if target.Reactions != nil {
				target.Reactions[emoji] = filterStr(target.Reactions[emoji], userIDStr)
				if len(target.Reactions[emoji]) == 0 {
					delete(target.Reactions, emoji)
				}
			}
			reactions := copyReactions(target.Reactions)
			msgID := target.ID
			room.mu.Unlock()
			s.broadcastAll(room, map[string]any{
				"type":      "reaction_updated",
				"room":      roomID,
				"messageId": msgID,
				"emoji":     emoji,
				"reactions": reactions,
			})

		default:
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "Unknown message type: " + msgType})
		}
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

func findMessage(msgs []*domain.ChatMessage, id string) *domain.ChatMessage {
	for _, m := range msgs {
		if m.ID == id {
			return m
		}
	}
	return nil
}

func findMessageIndex(msgs []*domain.ChatMessage, id string) int {
	for i, m := range msgs {
		if m.ID == id {
			return i
		}
	}
	return -1
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

func copyReactions(r map[string][]string) map[string][]string {
	out := make(map[string][]string, len(r))
	for k, v := range r {
		cp := make([]string, len(v))
		copy(cp, v)
		out[k] = cp
	}
	return out
}
