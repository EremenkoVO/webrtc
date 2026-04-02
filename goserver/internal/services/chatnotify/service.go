package chatnotify

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type Service struct {
	mu      sync.RWMutex
	clients map[int]map[*websocket.Conn]struct{}
}

func NewChatNotifyService() *Service {
	return &Service{
		clients: make(map[int]map[*websocket.Conn]struct{}),
	}
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, userID int) {
	s.mu.Lock()
	if s.clients[userID] == nil {
		s.clients[userID] = make(map[*websocket.Conn]struct{})
	}
	s.clients[userID][conn] = struct{}{}
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		if userClients := s.clients[userID]; userClients != nil {
			delete(userClients, conn)
			if len(userClients) == 0 {
				delete(s.clients, userID)
			}
		}
		s.mu.Unlock()
		_ = conn.Close()
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Service) NotifyUsers(userIDs []int, notification ports.ChatNotification) {
	if len(userIDs) == 0 {
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, uid := range userIDs {
		for conn := range s.clients[uid] {
			if err := conn.WriteJSON(map[string]any{
				"type":         "chat_notification",
				"scopeType":    notification.ScopeType,
				"scopeId":      notification.ScopeID,
				"fromUserId":   notification.FromUserID,
				"fromUsername": notification.FromUsername,
				"messageType":  notification.Type,
				"textPreview":  notification.TextPreview,
				"timestamp":    notification.Timestamp,
			}); err != nil {
				log.Printf("chat notify write: %v", err)
			}
		}
	}
}
