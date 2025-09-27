package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type tokenRepository struct {
	db *sql.DB
}

func NewTokenRepository(db *sql.DB) *tokenRepository {
	return &tokenRepository{db: db}
}

func (r *tokenRepository) StoreRefreshToken(ctx context.Context, token *domain.RefreshToken) error {
	query := `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, token.Token, token.UserID, token.ExpiresAt)
	return err
}

func (r *tokenRepository) FindRefreshToken(ctx context.Context, token string) (*domain.RefreshToken, error) {
	query := `SELECT token, user_id, expires_at FROM refresh_tokens WHERE token = ?`
	row := r.db.QueryRowContext(ctx, query, token)

	var refreshToken domain.RefreshToken
	err := row.Scan(&refreshToken.Token, &refreshToken.UserID, &refreshToken.ExpiresAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &refreshToken, nil
}

func (r *tokenRepository) DeleteRefreshToken(ctx context.Context, token string) error {
	query := `DELETE FROM refresh_tokens WHERE token = ?`
	_, err := r.db.ExecContext(ctx, query, token)

	return err
}

func (r *tokenRepository) DeleteAllRefreshTokens(ctx context.Context, userID int) error {
	query := `DELETE FROM refresh_tokens WHERE user_id = ?`
	_, err := r.db.ExecContext(ctx, query, userID)

	return err
}

func (r *tokenRepository) CleanExpiredTokens(ctx context.Context) error {
	query := `DELETE FROM refresh_tokens WHERE expires_at < ?`
	_, err := r.db.ExecContext(ctx, query, time.Now())

	return err
}
