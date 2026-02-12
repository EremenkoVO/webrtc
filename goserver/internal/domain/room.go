package domain

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Room struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
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
