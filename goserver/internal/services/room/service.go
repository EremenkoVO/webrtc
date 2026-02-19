package room

import (
	"context"
	"log"
	"maps"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type Service struct {
	repo    ports.RoomRepository
	rooms   map[string]*domain.Room // In-memory кэш для активных комнат с подключенными клиентами
	roomsMu sync.RWMutex
}

func NewRoomService(repo ports.RoomRepository) *Service {
	return &Service{
		repo:  repo,
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

	// Сохраняем комнату в БД
	ctx := context.Background()
	if err := s.repo.CreateRoom(ctx, room); err != nil {
		log.Printf("Failed to create room in database: %v", err)
		// Продолжаем работу даже если не удалось сохранить в БД
	}

	// Добавляем в in-memory кэш
	s.roomsMu.Lock()
	s.rooms[room.ID] = room
	s.roomsMu.Unlock()

	return room
}

func (s *Service) GetRoom(roomID string) *domain.Room {
	// Сначала проверяем in-memory кэш
	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if exists {
		return room
	}

	// Если нет в кэше, загружаем из БД
	ctx := context.Background()
	dbRoom, err := s.repo.GetRoom(ctx, roomID)
	if err != nil {
		log.Printf("Failed to get room from database: %v", err)
		return nil
	}

	if dbRoom == nil {
		return nil
	}

	// Добавляем в кэш
	s.roomsMu.Lock()
	s.rooms[dbRoom.ID] = dbRoom
	s.roomsMu.Unlock()

	return dbRoom
}

func (s *Service) ListRooms() []*domain.Room {
	// Загружаем все комнаты из БД
	ctx := context.Background()
	dbRooms, err := s.repo.ListRooms(ctx)
	if err != nil {
		log.Printf("Failed to list rooms from database: %v", err)
		// Fallback на in-memory кэш
		s.roomsMu.RLock()
		defer s.roomsMu.RUnlock()
		rooms := make([]*domain.Room, 0, len(s.rooms))
		for _, room := range s.rooms {
			rooms = append(rooms, room)
		}
		return rooms
	}

	// Объединяем данные из БД с актуальными данными о клиентах из кэша
	s.roomsMu.RLock()
	defer s.roomsMu.RUnlock()

	// Создаем map для быстрого поиска комнат из кэша
	cacheMap := make(map[string]*domain.Room)
	maps.Copy(cacheMap, s.rooms)

	// Обновляем комнаты из БД актуальными данными о клиентах из кэша
	for _, room := range dbRooms {
		if cachedRoom, exists := cacheMap[room.ID]; exists {
			// Используем актуальные данные о клиентах из кэша
			room.Clients = cachedRoom.Clients
		}
	}

	return dbRooms
}

// GetRoomParticipants returns a list of all participants in a room
func (s *Service) GetRoomParticipants(roomID string) []*domain.Client {
	room := s.GetRoom(roomID)
	if room == nil {
		return nil
	}

	room.Mu.RLock()
	defer room.Mu.RUnlock()

	participants := make([]*domain.Client, 0, len(room.Clients))
	for _, client := range room.Clients {
		participants = append(participants, client)
	}
	return participants
}

func (s *Service) HandleWebSocketConnection(conn *websocket.Conn) {
	clientID := uuid.NewString()
	client := &domain.Client{
		ID:   clientID,
		Conn: conn,
		Send: make(chan domain.SignalingMessage, 32),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go s.writePump(ctx, client)
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
			client.Username = msg.Username
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

		case "sound-event":
			if client.Room == nil {
				continue
			}
			// Broadcast sound events to all peers in the room
			client.Room.BroadcastExcept(msg, client.ID)

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

func (s *Service) writePump(ctx context.Context, client *domain.Client) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-client.Send:
			if err := client.Conn.WriteJSON(msg); err != nil {
				log.Println("write:", err)
				return
			}
		}
	}
}

type JoinPayload struct {
	RoomMates map[string]string `json:"room_mates"`
}
