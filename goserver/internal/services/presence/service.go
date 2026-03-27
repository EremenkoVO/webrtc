package presence

import (
	"context"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	presenceTypeSnapshot = "presence_snapshot"
	presenceTypeOnline   = "user_online"
	presenceTypeOffline  = "user_offline"
)

type presenceClient struct {
	conn *websocket.Conn
	send chan any
}

type Service struct {
	mu           sync.RWMutex
	onlineCounts map[int]int
	usernames    map[int]string
	userChannels map[int]string
	clients      map[*presenceClient]struct{}
}

func NewPresenceService() *Service {
	return &Service{
		onlineCounts: make(map[int]int),
		usernames:    make(map[int]string),
		userChannels: make(map[int]string),
		clients:      make(map[*presenceClient]struct{}),
	}
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, userID int) {
	client := &presenceClient{
		conn: conn,
		send: make(chan any, 16),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s.mu.Lock()
	s.clients[client] = struct{}{}
	s.onlineCounts[userID]++
	becameOnline := s.onlineCounts[userID] == 1
	snapshot := s.onlineUserIDsLocked()
	s.mu.Unlock()

	go s.writePump(ctx, client)

	client.send <- map[string]any{
		"type":            presenceTypeSnapshot,
		"online_users":    snapshot,
		"channel_members": s.channelMembersSnapshot(),
	}

	if becameOnline {
		s.broadcast(map[string]any{
			"type":    presenceTypeOnline,
			"user_id": strconv.Itoa(userID),
		}, client)
	}

	s.readPump(client)

	s.mu.Lock()
	delete(s.clients, client)
	count := s.onlineCounts[userID] - 1
	prevChannel := s.userChannels[userID]
	if count <= 0 {
		delete(s.onlineCounts, userID)
		delete(s.userChannels, userID)
		delete(s.usernames, userID)
	} else {
		s.onlineCounts[userID] = count
	}
	becameOffline := count <= 0
	s.mu.Unlock()

	cancel()
	_ = conn.Close()

	if becameOffline {
		if prevChannel != "" {
			s.broadcast(map[string]any{
				"type":       "user_channel_changed",
				"user_id":    strconv.Itoa(userID),
				"channel_id": "",
			}, nil)
		}
		s.broadcast(map[string]any{
			"type":    presenceTypeOffline,
			"user_id": strconv.Itoa(userID),
		}, nil)
	}
}

func (s *Service) UpdateUserChannel(userID int, username, channelID string) {
	s.mu.Lock()
	if username != "" {
		s.usernames[userID] = username
	}
	if channelID == "" {
		delete(s.userChannels, userID)
	} else {
		s.userChannels[userID] = channelID
	}
	s.mu.Unlock()

	s.broadcast(map[string]any{
		"type":       "user_channel_changed",
		"user_id":    strconv.Itoa(userID),
		"username":   username,
		"channel_id": channelID,
	}, nil)
}

func (s *Service) readPump(client *presenceClient) {
	defer close(client.send)
	for {
		if _, _, err := client.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Service) writePump(ctx context.Context, client *presenceClient) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-client.send:
			if !ok {
				return
			}
			if err := client.conn.WriteJSON(msg); err != nil {
				return
			}
		}
	}
}

func (s *Service) broadcast(payload any, skip *presenceClient) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for client := range s.clients {
		if client == skip {
			continue
		}
		select {
		case client.send <- payload:
		default:
		}
	}
}

func (s *Service) onlineUserIDsLocked() []string {
	users := make([]string, 0, len(s.onlineCounts))
	for userID := range s.onlineCounts {
		users = append(users, strconv.Itoa(userID))
	}
	return users
}

func (s *Service) channelMembersSnapshot() map[string][]map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make(map[string][]map[string]string)
	for userID, channelID := range s.userChannels {
		if channelID == "" {
			continue
		}
		out[channelID] = append(out[channelID], map[string]string{
			"user_id":  strconv.Itoa(userID),
			"username": s.usernames[userID],
		})
	}
	return out
}
