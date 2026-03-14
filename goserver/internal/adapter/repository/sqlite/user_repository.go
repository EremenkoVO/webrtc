package sqlite

import (
	"context"
	"database/sql"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type userRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *userRepository {
	return &userRepository{db: db}
}

func (r *userRepository) CreateUser(ctx context.Context, user *domain.User) error {
	query := `INSERT INTO users (id, username, password) VALUES (?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Username, user.Password)
	return err
}

func (r *userRepository) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `SELECT id, username, password, created_at FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var user domain.User
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *userRepository) FindByID(ctx context.Context, id int) (*domain.User, error) {
	query := `SELECT id, username, password, created_at, avatar, avatar_content_type FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var user domain.User
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt, &user.AvatarData, &user.AvatarContentType)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *userRepository) UserExists(ctx context.Context, username string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)`
	var exists bool
	err := r.db.QueryRowContext(ctx, query, username).Scan(&exists)

	return exists, err
}

func (r *userRepository) UpdateAvatar(ctx context.Context, userID int, data []byte, contentType string) error {
	query := `UPDATE users SET avatar = ?, avatar_content_type = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, data, contentType, userID)
	return err
}

func (r *userRepository) GetAvatarByUsername(ctx context.Context, username string) ([]byte, string, error) {
	query := `SELECT avatar, avatar_content_type FROM users WHERE username = ?`
	var data []byte
	var contentType string
	err := r.db.QueryRowContext(ctx, query, username).Scan(&data, &contentType)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	return data, contentType, nil
}
