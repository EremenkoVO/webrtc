package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type directConversationRepository struct {
	db *sql.DB
}

func NewDirectConversationRepository(db *sql.DB) *directConversationRepository {
	return &directConversationRepository{db: db}
}

func (r *directConversationRepository) Create(ctx context.Context, conv *domain.DirectConversation) error {
	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO direct_conversations (id, pair_key, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		conv.ID, conv.PairKey, conv.CreatedAt, conv.UpdatedAt,
	)
	return err
}

func (r *directConversationRepository) AddParticipant(ctx context.Context, conversationID string, userID int) error {
	_, err := r.db.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO direct_conversation_participants (conversation_id, user_id, created_at) VALUES (?, ?, ?)`,
		conversationID, userID, time.Now().UTC(),
	)
	return err
}

func (r *directConversationRepository) GetByID(ctx context.Context, id string) (*domain.DirectConversation, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, pair_key, created_at, updated_at FROM direct_conversations WHERE id = ?`,
		id,
	)
	return scanDirectConversation(row)
}

func (r *directConversationRepository) GetByPairKey(ctx context.Context, pairKey string) (*domain.DirectConversation, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, pair_key, created_at, updated_at FROM direct_conversations WHERE pair_key = ?`,
		pairKey,
	)
	return scanDirectConversation(row)
}

func (r *directConversationRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.DirectConversation, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT c.id, c.pair_key, c.created_at, c.updated_at
		 FROM direct_conversations c
		 JOIN direct_conversation_participants p ON p.conversation_id = c.id
		 WHERE p.user_id = ?
		 ORDER BY c.updated_at DESC, c.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint:errcheck

	var out []*domain.DirectConversation
	for rows.Next() {
		c := &domain.DirectConversation{}
		if err := rows.Scan(&c.ID, &c.PairKey, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *directConversationRepository) ListParticipants(ctx context.Context, conversationID string) ([]*domain.DirectConversationParticipant, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT p.user_id, u.username, u.display_name
		 FROM direct_conversation_participants p
		 JOIN users u ON u.id = p.user_id
		 WHERE p.conversation_id = ?
		 ORDER BY p.created_at ASC`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint:errcheck

	var out []*domain.DirectConversationParticipant
	for rows.Next() {
		p := &domain.DirectConversationParticipant{}
		if err := rows.Scan(&p.UserID, &p.Username, &p.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *directConversationRepository) IsParticipant(ctx context.Context, conversationID string, userID int) (bool, error) {
	var v int
	err := r.db.QueryRowContext(
		ctx,
		`SELECT 1 FROM direct_conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
		conversationID, userID,
	).Scan(&v)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func scanDirectConversation(row *sql.Row) (*domain.DirectConversation, error) {
	c := &domain.DirectConversation{}
	err := row.Scan(&c.ID, &c.PairKey, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}
