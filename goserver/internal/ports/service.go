package ports

import (
	"context"

	"github.com/gorilla/websocket"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type AuthService interface {
	Register(ctx context.Context, username, password string) (*domain.AuthTokens, error)
	Login(ctx context.Context, username, password string) (*domain.AuthTokens, error)
	RefreshToken(ctx context.Context, refreshToken string) (*domain.AuthTokens, error)
	Logout(ctx context.Context, accessToken string) error
	ValidateToken(ctx context.Context, token string) (int, error)
}

type UserService interface {
	GetProfile(ctx context.Context, userID int) (*domain.User, error)
}

type RoomService interface {
	ListRooms() []*domain.Room
	CreateRoom(roomName string) *domain.Room
	GetRoom(roomID string) *domain.Room
	HandleWebSocketConnection(conn *websocket.Conn)
}
