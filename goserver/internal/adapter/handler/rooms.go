package handler

import "net/http"

// List available rooms
// (GET /api/v1/rooms)
func (s *ServerWrapper) ListRooms(w http.ResponseWriter, r *http.Request) {}

// Create a new signaling room
// (POST /api/v1/rooms)
func (s *ServerWrapper) CreateRoom(w http.ResponseWriter, r *http.Request) {}

// Join a signaling room
// (POST /api/v1/rooms/{roomId}/join)
func (s *ServerWrapper) JoinRoom(w http.ResponseWriter, r *http.Request, roomId string) {}

// WebSocket connection for signaling
// (GET /api/v1/ws)
func (s *ServerWrapper) SignalingWebSocket(w http.ResponseWriter, r *http.Request) {}
