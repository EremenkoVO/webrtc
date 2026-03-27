package ports

import (
	"context"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) error
	FindByUsername(ctx context.Context, username string) (*domain.User, error)
	FindByID(ctx context.Context, id int) (*domain.User, error)
	// FindUsernamesByIDs returns usernames for the given user IDs (missing IDs are omitted).
	FindUsernamesByIDs(ctx context.Context, ids []int) (map[int]string, error)
	UserExists(ctx context.Context, username string) (bool, error)
	UpdateAvatar(ctx context.Context, userID int, data []byte, contentType string) error
	GetAvatarByUsername(ctx context.Context, username string) ([]byte, string, error)
	UpdatePassword(ctx context.Context, userID int, hashedPassword string) error
	UpdateProfile(ctx context.Context, userID int, user *domain.User) error
	UpdateLastSeen(ctx context.Context, userID int) error
	FindByUsernamePublic(ctx context.Context, username string) (*domain.User, error)
	ListUsers(ctx context.Context) ([]*domain.User, error)
	// ListUsersForDirectory returns id, username, and whether an avatar exists (no blob loaded).
	ListUsersForDirectory(ctx context.Context) ([]*domain.UserDirectoryEntry, error)
	DeleteUser(ctx context.Context, userID int) error
	UpdateUserRole(ctx context.Context, userID int, role string) error
	HasAdmin(ctx context.Context) (bool, error)
	GetUserRole(ctx context.Context, userID int) (string, error)
	IsBootstrapAdmin(ctx context.Context, userID int) (bool, error)
	SetBootstrapAdmin(ctx context.Context, userID int) error
}

type AuditRepository interface {
	LogEvent(ctx context.Context, eventType, actor, target, details string) error
	ListEvents(ctx context.Context, limit int) ([]*domain.AuditEvent, error)
}

type AccessTokenRepository interface {
	Get(token string) (int, bool)
	Set(userID int, token string, expiresAt time.Time)
	Delete(token string)
}

type TokenRepository interface {
	StoreRefreshToken(ctx context.Context, token *domain.RefreshToken) error
	FindRefreshToken(ctx context.Context, token string) (*domain.RefreshToken, error)
	DeleteRefreshToken(ctx context.Context, token string) error
	DeleteAllRefreshTokens(ctx context.Context, userID int) error
	CleanExpiredTokens(ctx context.Context) error
}

type RoomRepository interface {
	CreateRoom(ctx context.Context, room *domain.Room) error
	GetRoom(ctx context.Context, roomID string) (*domain.Room, error)
	ListRooms(ctx context.Context) ([]*domain.Room, error)
	DeleteRoom(ctx context.Context, roomID string) error
}

type ChatMessageRepository interface {
	Store(ctx context.Context, msg *domain.ChatMessage) error
	GetByID(ctx context.Context, id string) (*domain.ChatMessage, error)
	ListByRoom(ctx context.Context, roomID string, limit int) ([]*domain.ChatMessage, error)
	UpdateText(ctx context.Context, id, text string) error
	Delete(ctx context.Context, id string) error
	UpdateReactions(ctx context.Context, id string, reactions map[string][]string) error
	GetOwner(ctx context.Context, id string) (string, error) // returns from_user
	StoreVoice(ctx context.Context, msg *domain.ChatMessage, data []byte, contentType string) error
	GetVoiceData(ctx context.Context, id string) (data []byte, contentType string, err error)
	StoreFile(ctx context.Context, msg *domain.ChatMessage) error
	GetFileMeta(ctx context.Context, id string) (filePath, fileName, contentType string, err error)
	ClearAllFiles(ctx context.Context) error
}
