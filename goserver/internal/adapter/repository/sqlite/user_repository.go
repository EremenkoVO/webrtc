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
	role := user.Role
	if role == "" {
		role = "user"
	}
	query := `INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Username, user.Password, role)
	return err
}

func (r *userRepository) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `SELECT id, username, password, created_at, role FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var user domain.User
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt, &user.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *userRepository) FindByID(ctx context.Context, id int) (*domain.User, error) {
	query := `SELECT id, username, password, created_at, avatar, avatar_content_type, role FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var user domain.User
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt, &user.AvatarData, &user.AvatarContentType, &user.Role)
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

func (r *userRepository) UpdatePassword(ctx context.Context, userID int, hashedPassword string) error {
	query := `UPDATE users SET password = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, hashedPassword, userID)
	return err
}

func (r *userRepository) UpdateLastSeen(ctx context.Context, userID int) error {
	query := `UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, userID)
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

func (r *userRepository) ListUsers(ctx context.Context) ([]*domain.User, error) {
	query := `SELECT id, username, created_at, last_seen_at, role FROM users ORDER BY created_at ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	var users []*domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Username, &u.CreatedAt, &u.LastSeenAt, &u.Role); err != nil {
			return nil, err
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}

func (r *userRepository) DeleteUser(ctx context.Context, userID int) error {
	query := `DELETE FROM users WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, userID)
	return err
}

func (r *userRepository) UpdateUserRole(ctx context.Context, userID int, role string) error {
	query := `UPDATE users SET role = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, role, userID)
	return err
}

func (r *userRepository) HasAdmin(ctx context.Context) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')`
	var exists bool
	err := r.db.QueryRowContext(ctx, query).Scan(&exists)
	return exists, err
}

func (r *userRepository) GetUserRole(ctx context.Context, userID int) (string, error) {
	query := `SELECT role FROM users WHERE id = ?`
	var role string
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&role)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return role, err
}
