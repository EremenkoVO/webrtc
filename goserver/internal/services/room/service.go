package room

import (
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type Service struct {
	rooms   map[string]*domain.Room
	roomsMu sync.RWMutex
}

func NewRoomService() *Service {
	return &Service{
		rooms: make(map[string]*domain.Room),
	}
}

func (s *Service) CreateRoom(name string) *domain.Room {
	room := &domain.Room{
		ID:        uuid.NewString(),
		Name:      name,
		CreatedAt: time.Now(),
		Clients:   make(map[string]*domain.Client),
	}

	s.roomsMu.Lock()
	s.rooms[room.ID] = room
	s.roomsMu.Unlock()

	return room
}

func (s *Service) GetRoom(roomID string) *domain.Room {
	s.roomsMu.RLock()
	defer s.roomsMu.RUnlock()
	return s.rooms[roomID]
}

func (s *Service) ListRooms() []*domain.Room {
	s.roomsMu.RLock()
	defer s.roomsMu.RUnlock()

	rooms := make([]*domain.Room, 0, len(s.rooms))
	for _, room := range s.rooms {
		rooms = append(rooms, room)
	}
	return rooms
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn) {
	clientID := uuid.NewString()
	client := &domain.Client{
		ID:   clientID,
		Conn: conn,
		Send: make(chan domain.SignalingMessage, 32),
	}

	go s.writePump(client)
	s.readPump(client)
}

func (s *Service) readPump(client *domain.Client) {
	defer func() {
		if client.Room != nil {
			client.Room.Mu.Lock()
			delete(client.Room.Clients, client.ID)
			client.Room.Mu.Unlock()
			client.Room.BroadcastExcept(domain.SignalingMessage{Type: "leave", From: client.ID}, client.ID)
		}
		_ = client.Conn.Close()
	}()

	for {
		var msg domain.SignalingMessage
		if err := client.Conn.ReadJSON(&msg); err != nil {
			log.Println("read:", err)
			return
		}

		switch msg.Type {
		case "join":
			room := s.GetRoom(msg.Room)
			if room == nil {
				continue
			}
			client.Room = room
			room.Mu.Lock()
			room.Clients[client.ID] = client
			room.Mu.Unlock()

			client.Send <- domain.SignalingMessage{
				Type:     "joined",
				From:     client.ID,
				Username: msg.Username,
				Payload: JoinPayload{
					RoomMates: func(clients map[string]*domain.Client) map[string]string {
						roommates := make(map[string]string, len(clients)-1)
						for id, c := range clients {
							if client.ID == c.ID {
								continue
							}

							roommates[id] = c.Username
						}
						return roommates
					}(room.Clients),
				},
			}
			room.BroadcastExcept(
				domain.SignalingMessage{Type: "peer-joined", From: client.ID, Username: msg.Username},
				client.ID,
			)

		case "offer", "answer", "ice":
			if client.Room == nil {
				continue
			}
			client.Room.Forward(msg, client.ID)

		case "leave":
			if client.Room != nil {
				client.Room.Mu.Lock()
				delete(client.Room.Clients, client.ID)
				client.Room.Mu.Unlock()
				client.Room.BroadcastExcept(domain.SignalingMessage{Type: "leave", From: client.ID}, client.ID)
				client.Room = nil
			}
		}
	}
}

func (s *Service) writePump(client *domain.Client) {
	for msg := range client.Send {
		if err := client.Conn.WriteJSON(msg); err != nil {
			log.Println("write:", err)
			return
		}
	}
}

type JoinPayload struct {
	RoomMates map[string]string `json:"room_mates"`
}
