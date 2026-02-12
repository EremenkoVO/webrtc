package handler

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"slices"

	"github.com/gorilla/websocket"
	"github.com/moeryomenko/xiter"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
	// Allow all subprotocols
	Subprotocols: []string{},
	// Read and write buffer sizes
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func ToPtr[T any](v T) *T {
	return &v
}

// List available rooms
// (GET /api/v1/rooms)
func (s *ServerWrapper) ListRooms(w http.ResponseWriter, r *http.Request) {
	rooms := s.roomService.ListRooms()

	apiRooms := make([]api.Room, len(rooms))
	for i, room := range rooms {
		apiRooms[i] = api.Room{
			Id:        &room.ID,
			Name:      &room.Name,
			CreatedAt: &room.CreatedAt,
			Roommates: ToPtr(slices.Collect(xiter.IterFunc(maps.Values(room.Clients), func(client *domain.Client) string {
				return client.Username
			}))),
		}
	}

	WriteJSONResponse(w, http.StatusOK, apiRooms)
}

// Create a new signaling room
// (POST /api/v1/rooms)
func (s *ServerWrapper) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var req api.CreateRoomJSONRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		WriteErrorResponse(w, http.StatusBadRequest, api.ErrorResponse{
			Message: "invalid request",
		})
		return
	}

	room := s.roomService.CreateRoom(req.Name)

	apiRoom := api.Room{
		Id:        &room.ID,
		Name:      &room.Name,
		CreatedAt: &room.CreatedAt,
	}

	WriteJSONResponse(w, http.StatusCreated, apiRoom)
}

// Join a signaling room
// (POST /api/v1/rooms/{roomId}/join)
func (s *ServerWrapper) JoinRoom(w http.ResponseWriter, r *http.Request, roomId string) {
	room := s.roomService.GetRoom(roomId)
	if room == nil {
		WriteErrorResponse(w, http.StatusNotFound, api.ErrorResponse{
			Message: "room not found",
		})
		return
	}

	clientID := "client_" + roomId // This would be generated based on user context
	resp := api.RoomJoinResponse{
		RoomId:   &room.ID,
		ClientId: &clientID,
	}

	WriteJSONResponse(w, http.StatusOK, resp)
}

// Get room participants
// (GET /api/v1/rooms/{roomId}/participants)
func (s *ServerWrapper) GetRoomParticipants(w http.ResponseWriter, r *http.Request, roomId string) {
	room := s.roomService.GetRoom(roomId)
	if room == nil {
		WriteErrorResponse(w, http.StatusNotFound, api.ErrorResponse{
			Message: "room not found",
		})
		return
	}

	participants := s.roomService.GetRoomParticipants(roomId)
	if participants == nil {
		WriteErrorResponse(w, http.StatusNotFound, api.ErrorResponse{
			Message: "room not found",
		})
		return
	}

	apiParticipants := make([]api.RoomParticipant, len(participants))
	for i, client := range participants {
		apiParticipants[i] = api.RoomParticipant{
			ClientId: &client.ID,
			Username: &client.Username,
		}
	}

	resp := api.RoomParticipantsResponse{
		RoomId:       &roomId,
		Participants: &apiParticipants,
	}

	WriteJSONResponse(w, http.StatusOK, resp)
}

// WebSocket connection for signaling
// (GET /api/v1/ws)
func (s *ServerWrapper) SignalingWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, api.ErrorResponse{
			Message: fmt.Sprintf("failed to upgrade connection: %v", err),
		})
	}

	s.roomService.HandleWebSocketConnection(conn)
}
