package sqlite

import (
	"context"
	"database/sql"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type auditRepository struct {
	db *sql.DB
}

func NewAuditRepository(db *sql.DB) ports.AuditRepository {
	return &auditRepository{db: db}
}

func (r *auditRepository) LogEvent(ctx context.Context, eventType, actor, target, details string) error {
	query := `INSERT INTO audit_log (event_type, actor, target, details) VALUES (?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, eventType, actor, target, details)
	return err
}

func (r *auditRepository) ListEvents(ctx context.Context, limit int) ([]*domain.AuditEvent, error) {
	query := `SELECT id, event_type, actor, target, details, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	var events []*domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		if err := rows.Scan(&e.ID, &e.EventType, &e.Actor, &e.Target, &e.Details, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, &e)
	}
	return events, rows.Err()
}
