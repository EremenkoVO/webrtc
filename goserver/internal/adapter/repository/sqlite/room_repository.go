package sqlite

import (
	"context"
	"database/sql"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type roomRepository struct {
	db *sql.DB
}

func NewRoomRepository(db *sql.DB) *roomRepository {
	return &roomRepository{db: db}
}

func (r *roomRepository) CreateRoom(ctx context.Context, room *domain.Room) error {
	query := `INSERT INTO rooms (id, name, type, created_at) VALUES (?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, room.ID, room.Name, room.Type, room.CreatedAt)
	return err
}

func (r *roomRepository) GetRoom(ctx context.Context, roomID string) (*domain.Room, error) {
	query := `SELECT id, name, type, created_at FROM rooms WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, roomID)

	var room domain.Room
	err := row.Scan(&room.ID, &room.Name, &room.Type, &room.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	// Инициализируем Clients map для активных соединений (не сохраняется в БД)
	room.Clients = make(map[string]*domain.Client)

	return &room, nil
}

func (r *roomRepository) ListRooms(ctx context.Context) ([]*domain.Room, error) {
	query := `SELECT id, name, type, created_at FROM rooms ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	rooms := make([]*domain.Room, 0)
	for rows.Next() {
		var room domain.Room
		err := rows.Scan(&room.ID, &room.Name, &room.Type, &room.CreatedAt)
		if err != nil {
			return nil, err
		}

		// Инициализируем Clients map для активных соединений (не сохраняется в БД)
		room.Clients = make(map[string]*domain.Client)

		rooms = append(rooms, &room)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return rooms, nil
}

func (r *roomRepository) DeleteRoom(ctx context.Context, roomID string) error {
	query := `DELETE FROM rooms WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, roomID)
	return err
}
