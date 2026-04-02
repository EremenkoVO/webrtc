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
	UpdateProfile(ctx context.Context, userID int, profile *domain.User) (*domain.User, error)
	GetPublicProfileByUsername(ctx context.Context, username string) (*domain.User, error)
}

type RoomService interface {
	ListRooms() []*domain.Room
	CreateRoom(roomName, roomType string) *domain.Room
	GetRoom(roomID string) *domain.Room
	GetRoomParticipants(roomID string) []*domain.Client
	HandleWebSocketConnection(conn *websocket.Conn, userID int, username string)
}

type ChatService interface {
	HandleWebSocketConnection(conn *websocket.Conn, userID int, username, scopeType, scopeID string)
	BroadcastToScope(scopeType, scopeID string, msg any)
}

type ChatNotification struct {
	ScopeType    string
	ScopeID      string
	FromUserID   string
	FromUsername string
	Type         string
	TextPreview  string
	Timestamp    string
}

type ChatNotifyService interface {
	HandleWebSocketConnection(conn *websocket.Conn, userID int)
	NotifyUsers(userIDs []int, notification ChatNotification)
}

type DirectConversationService interface {
	CreateOrGet(ctx context.Context, userID int, peerUserID int) (*domain.DirectConversation, bool, error)
	Get(ctx context.Context, userID int, conversationID string) (*domain.DirectConversation, error)
	ListByUserID(ctx context.Context, userID int) ([]*domain.DirectConversation, error)
	IsParticipant(ctx context.Context, userID int, conversationID string) (bool, error)
}

type PresenceService interface {
	HandleWebSocketConnection(conn *websocket.Conn, userID int)
	UpdateUserChannel(userID int, username, channelID string)
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
