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
	ListPublicDirectory(ctx context.Context) ([]*domain.UserDirectoryEntry, error)
	UploadAvatar(ctx context.Context, userID int, data []byte, contentType string) error
	GetAvatar(ctx context.Context, username string) ([]byte, string, error)
	ChangePassword(ctx context.Context, userID int, currentPassword, newPassword string) error
}

type RoomService interface {
	ListRooms() []*domain.Room
	CreateRoom(roomName, roomType string) *domain.Room
	GetRoom(roomID string) *domain.Room
	GetRoomParticipants(roomID string) []*domain.Client
	HandleWebSocketConnection(conn *websocket.Conn, userID int, username string)
}

type ChatService interface {
	HandleWebSocketConnection(conn *websocket.Conn, userID int, username, roomID string)
	BroadcastToRoom(roomID string, msg any)
}

type AdminService interface {
	GetSetupStatus(ctx context.Context) (bool, error)
	Setup(ctx context.Context, username, password string) (*domain.AuthTokens, error)
	GetUserRole(ctx context.Context, userID int) (string, error)
	ListUsers(ctx context.Context) ([]*domain.User, error)
	DeleteUser(ctx context.Context, adminID, targetID int) error
	UpdateUserRole(ctx context.Context, adminID, targetID int, role string) error
	ListRooms(ctx context.Context) ([]*domain.Room, error)
	DeleteRoom(ctx context.Context, adminID int, roomID string) error
	GetStats(ctx context.Context) (*domain.AdminStats, error)
	GetAuditLog(ctx context.Context, limit int) ([]*domain.AuditEvent, error)
}
