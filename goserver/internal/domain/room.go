package domain

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Room struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "voice" | "text"
	CreatedAt time.Time `json:"created_at"`

	// TODO: вынести в отдельную сущность/компонент.
	Clients map[string]*Client
	Mu      sync.RWMutex
}

type Client struct {
	ID       string
	Username string
	Conn     *websocket.Conn
	Send     chan SignalingMessage
	Room     *Room
}

type SignalingMessage struct {
	Type     string `json:"type"`
	Room     string `json:"room,omitempty"`
	Username string `json:"username,omitempty"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
	Payload  any    `json:"payload,omitempty"`
}

// ChatMessage represents a text chat message in a room.
type ChatMessage struct {
	ID        string              `json:"id"`
	Type      string              `json:"type"`
	Room      string              `json:"room"`
	From      string              `json:"from"`      // string(userID)
	Username  string              `json:"username"`
	Text      string              `json:"text"`
	Timestamp time.Time           `json:"timestamp"`
	Edited          bool                `json:"edited"`
	Reactions       map[string][]string `json:"reactions"`        // emoji -> []username
	ReplyToID       string              `json:"replyToId,omitempty"`
	ReplyToUsername string              `json:"replyToUsername,omitempty"`
	ReplyToText     string              `json:"replyToText,omitempty"`
	VoiceURL        string              `json:"voiceUrl,omitempty"`
	VoiceDuration   float64             `json:"voiceDuration,omitempty"`
	FileURL         string              `json:"fileUrl,omitempty"`
	FileName        string              `json:"fileName,omitempty"`
	FileSize        int64               `json:"fileSize,omitempty"`
	FileContentType string              `json:"fileContentType,omitempty"`
}

// ChatClient represents an active chat WebSocket connection.
type ChatClient struct {
	ConnID   string // UUID (connection-specific)
	UserID   int
	Username string
	RoomID   string
	Conn     *websocket.Conn
}

func (r *Room) BroadcastExcept(msg SignalingMessage, except string) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()
	for id, client := range r.Clients {
		if id == except {
			continue
		}
		select {
		case client.Send <- msg:
		default:
		}
	}
}

func (r *Room) Forward(msg SignalingMessage, from string) {
	msg.From = from
	if msg.To != "" {
		r.Mu.RLock()
		target := r.Clients[msg.To]
		r.Mu.RUnlock()
		if target != nil {
			target.Send <- msg
		}
		return
	}
	r.BroadcastExcept(msg, from)
}
