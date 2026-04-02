package handler

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"slices"
	"strconv"

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
		roomType := api.RoomType(room.Type)
		apiRooms[i] = api.Room{
			Id:        &room.ID,
			Name:      &room.Name,
			Type:      &roomType,
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

	roomType := "voice"
	if req.Type != nil {
		roomType = string(*req.Type)
	}

	room := s.roomService.CreateRoom(req.Name, roomType)

	// Log audit event - get username from profile if available
	if userID, ok := r.Context().Value(contextKeyUserID).(int); ok {
		actor := strconv.Itoa(userID)
		if profile, err := s.userService.GetProfile(r.Context(), userID); err == nil {
			actor = profile.Username
		}
		_ = s.auditRepo.LogEvent(r.Context(), domain.AuditEventRoomCreate, actor, room.Name, room.ID)
	}

	rt := api.RoomType(room.Type)
	apiRoom := api.Room{
		Id:        &room.ID,
		Name:      &room.Name,
		Type:      &rt,
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
func (s *ServerWrapper) SignalingWebSocket(w http.ResponseWriter, r *http.Request, params api.SignalingWebSocketParams) {
	token := params.Token
	userID, err := s.authService.ValidateToken(r.Context(), token)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	username := "Anonymous"
	if profile, err := s.userService.GetProfile(r.Context(), userID); err == nil && profile.Username != "" {
		username = profile.Username
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, api.ErrorResponse{
			Message: fmt.Sprintf("failed to upgrade connection: %v", err),
		})
		return
	}

	s.roomService.HandleWebSocketConnection(conn, userID, username)
}

// WebSocket connection for text chat
// (GET /api/v1/chat/ws)
func (s *ServerWrapper) ChatWebSocket(w http.ResponseWriter, r *http.Request, params api.ChatWebSocketParams) {
	// Validate token from query param
	userID, err := s.authService.ValidateToken(r.Context(), params.Token)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	scopeType := string(params.ScopeType)
	scopeID := params.ScopeId
	if scopeType == "channel" {
		room := s.roomService.GetRoom(scopeID)
		if room == nil {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
	}
	if scopeType == "dm" {
		ok, derr := s.dmService.IsParticipant(r.Context(), userID, scopeID)
		if derr != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "conversation not found", http.StatusNotFound)
			return
		}
	}

	// Get username: prefer query param, then fetch from profile
	username := ""
	if params.Username != nil {
		username = *params.Username
	}
	if username == "" {
		if profile, err := s.userService.GetProfile(r.Context(), userID); err == nil {
			username = profile.Username
		}
	}
	if username == "" {
		username = "Anonymous"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	s.chatService.HandleWebSocketConnection(conn, userID, username, scopeType, scopeID)
}

// ChatNotificationsWebSocket upgrades to a dedicated notifications websocket.
func (s *ServerWrapper) ChatNotificationsWebSocket(w http.ResponseWriter, r *http.Request, params api.ChatNotificationsWebSocketParams) {
	userID, err := s.authService.ValidateToken(r.Context(), params.Token)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.chatNotifySvc.HandleWebSocketConnection(conn, userID)
}

// PresenceWebSocket upgrades to a dedicated presence websocket.
func (s *ServerWrapper) PresenceWebSocket(w http.ResponseWriter, r *http.Request, _ api.PresenceWebSocketParams) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := s.authService.ValidateToken(r.Context(), token)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, api.ErrorResponse{
			Message: fmt.Sprintf("failed to upgrade connection: %v", err),
		})
		return
	}

	s.presenceSvc.HandleWebSocketConnection(conn, userID)
}
