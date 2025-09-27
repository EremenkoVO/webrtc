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

func (r *userRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `SELECT id, username, password, created_at FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, email)

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

func (r *userRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	query := `SELECT id, username, password, created_at FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

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

func (r *userRepository) UserExists(ctx context.Context, username string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)`
	var exists bool
	err := r.db.QueryRowContext(ctx, query, username).Scan(&exists)

	return exists, err
}
