package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

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
	boot := 0
	if user.BootstrapAdmin {
		boot = 1
	}
	query := `INSERT INTO users (id, username, password, role, bootstrap_admin) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Username, user.Password, role, boot)
	return err
}

func (r *userRepository) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `SELECT id, username, password, created_at, role, COALESCE(bootstrap_admin, 0) FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var user domain.User
	var boot int
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt, &user.Role, &boot)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	user.BootstrapAdmin = boot != 0
	return &user, nil
}

func (r *userRepository) FindByID(ctx context.Context, id int) (*domain.User, error) {
	query := `SELECT id, username, password, created_at, avatar, avatar_content_type, role, COALESCE(bootstrap_admin, 0) FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var user domain.User
	var boot int
	err := row.Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt, &user.AvatarData, &user.AvatarContentType, &user.Role, &boot)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	user.BootstrapAdmin = boot != 0
	return &user, nil
}

func (r *userRepository) FindUsernamesByIDs(ctx context.Context, ids []int) (map[int]string, error) {
	seen := make(map[int]struct{})
	var unique []int
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return map[int]string{}, nil
	}

	placeholders := make([]string, len(unique))
	args := make([]any, len(unique))
	for i, id := range unique {
		placeholders[i] = "?"
		args[i] = id
	}
	query := fmt.Sprintf(`SELECT id, username FROM users WHERE id IN (%s)`, strings.Join(placeholders, ","))
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	out := make(map[int]string)
	for rows.Next() {
		var id int
		var username string
		if err := rows.Scan(&id, &username); err != nil {
			return nil, err
		}
		out[id] = username
	}
	return out, rows.Err()
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
	query := `SELECT id, username, created_at, last_seen_at, role, COALESCE(bootstrap_admin, 0) FROM users ORDER BY created_at ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	var users []*domain.User
	for rows.Next() {
		var u domain.User
		var boot int
		if err := rows.Scan(&u.ID, &u.Username, &u.CreatedAt, &u.LastSeenAt, &u.Role, &boot); err != nil {
			return nil, err
		}
		u.BootstrapAdmin = boot != 0
		users = append(users, &u)
	}
	return users, rows.Err()
}

func (r *userRepository) ListUsersForDirectory(ctx context.Context) ([]*domain.UserDirectoryEntry, error) {
	query := `SELECT id, username,
		CASE WHEN COALESCE(LENGTH(avatar), 0) > 0 THEN 1 ELSE 0 END
		FROM users ORDER BY username COLLATE NOCASE ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	var out []*domain.UserDirectoryEntry
	for rows.Next() {
		var e domain.UserDirectoryEntry
		var hasAvatar int
		if err := rows.Scan(&e.ID, &e.Username, &hasAvatar); err != nil {
			return nil, err
		}
		e.HasAvatar = hasAvatar != 0
		out = append(out, &e)
	}
	return out, rows.Err()
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

func (r *userRepository) IsBootstrapAdmin(ctx context.Context, userID int) (bool, error) {
	query := `SELECT COALESCE(bootstrap_admin, 0) FROM users WHERE id = ?`
	var boot int
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&boot)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return boot != 0, nil
}

func (r *userRepository) SetBootstrapAdmin(ctx context.Context, userID int) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET bootstrap_admin = 1 WHERE id = ?`, userID)
	return err
}
