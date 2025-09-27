package ports

import (
	"context"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) error
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	FindByID(ctx context.Context, id int) (*domain.User, error)
	UserExists(ctx context.Context, email string) (bool, error)
}

type TokenRepository interface {
	StoreRefreshToken(ctx context.Context, token *domain.RefreshToken) error
	FindRefreshToken(ctx context.Context, token string) (*domain.RefreshToken, error)
	DeleteRefreshToken(ctx context.Context, token string) error
	DeleteAllRefreshTokens(ctx context.Context, userID int) error
	CleanExpiredTokens(ctx context.Context) error
}
