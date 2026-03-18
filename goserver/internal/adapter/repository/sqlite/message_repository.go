package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type messageRepository struct {
	db *sql.DB
}

func NewChatMessageRepository(db *sql.DB) *messageRepository {
	return &messageRepository{db: db}
}

func (r *messageRepository) Store(ctx context.Context, msg *domain.ChatMessage) error {
	reactionsJSON, err := json.Marshal(msg.Reactions)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx,
		`INSERT INTO chat_messages
		 (id, room_id, from_user, username, text, reactions, reply_to_id, reply_to_username, reply_to_text, edited, created_at, msg_type)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		msg.ID, msg.Room, msg.From, msg.Username, msg.Text,
		string(reactionsJSON),
		msg.ReplyToID, msg.ReplyToUsername, msg.ReplyToText,
		boolToInt(msg.Edited), msg.Timestamp, msg.Type,
	)
	return err
}

func (r *messageRepository) StoreVoice(ctx context.Context, msg *domain.ChatMessage, data []byte, contentType string) error {
	reactionsJSON, _ := json.Marshal(msg.Reactions)
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO chat_messages
		 (id, room_id, from_user, username, text, reactions, reply_to_id, reply_to_username, reply_to_text, edited, created_at, msg_type, voice_data, voice_content_type, voice_duration)
		 VALUES (?, ?, ?, ?, '', ?, '', '', '', 0, ?, 'voice_message', ?, ?, ?)`,
		msg.ID, msg.Room, msg.From, msg.Username,
		string(reactionsJSON),
		msg.Timestamp,
		data, contentType, msg.VoiceDuration,
	)
	return err
}

func (r *messageRepository) GetVoiceData(ctx context.Context, id string) ([]byte, string, error) {
	var data []byte
	var contentType string
	err := r.db.QueryRowContext(ctx,
		`SELECT voice_data, voice_content_type FROM chat_messages WHERE id = ?`, id,
	).Scan(&data, &contentType)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	return data, contentType, err
}

func (r *messageRepository) StoreFile(ctx context.Context, msg *domain.ChatMessage) error {
	reactionsJSON, _ := json.Marshal(msg.Reactions)
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO chat_messages
		 (id, room_id, from_user, username, text, reactions, reply_to_id, reply_to_username, reply_to_text, edited, created_at, msg_type, file_path, file_name, file_size, file_content_type)
		 VALUES (?, ?, ?, ?, '', ?, '', '', '', 0, ?, 'file_message', ?, ?, ?, ?)`,
		msg.ID, msg.Room, msg.From, msg.Username,
		string(reactionsJSON),
		msg.Timestamp,
		msg.FileURL, msg.FileName, msg.FileSize, msg.FileContentType,
	)
	return err
}

func (r *messageRepository) GetFileMeta(ctx context.Context, id string) (string, string, string, error) {
	var filePath, fileName, contentType string
	err := r.db.QueryRowContext(ctx,
		`SELECT file_path, file_name, file_content_type FROM chat_messages WHERE id = ?`, id,
	).Scan(&filePath, &fileName, &contentType)
	if err == sql.ErrNoRows {
		return "", "", "", nil
	}
	return filePath, fileName, contentType, err
}

func (r *messageRepository) GetByID(ctx context.Context, id string) (*domain.ChatMessage, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, room_id, from_user, username, text, reactions, reply_to_id, reply_to_username, reply_to_text, edited, created_at, msg_type, voice_duration, file_path, file_name, file_size, file_content_type
		 FROM chat_messages WHERE id = ?`, id)
	return scanMessage(row)
}

func (r *messageRepository) ListByRoom(ctx context.Context, roomID string, limit int) ([]*domain.ChatMessage, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, room_id, from_user, username, text, reactions, reply_to_id, reply_to_username, reply_to_text, edited, created_at, msg_type, voice_duration, file_path, file_name, file_size, file_content_type
		 FROM chat_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ?`,
		roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close() //nolint: errcheck

	var msgs []*domain.ChatMessage
	for rows.Next() {
		msg, err := scanMessageRow(rows)
		if err != nil {
			return nil, err
		}
		if msg.Type == "voice_message" {
			msg.VoiceURL = "/api/v1/chat/messages/" + msg.ID + "/voice"
		}
		if msg.Type == "file_message" && msg.FileName != "" {
			msg.FileURL = "/api/v1/chat/files/" + msg.ID
		}
		msgs = append(msgs, msg)
	}
	return msgs, rows.Err()
}

func (r *messageRepository) UpdateText(ctx context.Context, id, text string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE chat_messages SET text = ?, edited = 1 WHERE id = ?`, text, id)
	return err
}

func (r *messageRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM chat_messages WHERE id = ?`, id)
	return err
}

func (r *messageRepository) UpdateReactions(ctx context.Context, id string, reactions map[string][]string) error {
	reactionsJSON, err := json.Marshal(reactions)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx,
		`UPDATE chat_messages SET reactions = ? WHERE id = ?`, string(reactionsJSON), id)
	return err
}

func (r *messageRepository) GetOwner(ctx context.Context, id string) (string, error) {
	var fromUser string
	err := r.db.QueryRowContext(ctx, `SELECT from_user FROM chat_messages WHERE id = ?`, id).Scan(&fromUser)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return fromUser, err
}

func scanMessage(row *sql.Row) (*domain.ChatMessage, error) {
	var reactionsJSON string
	var editedInt int
	var msgType string
	var voiceDuration float64
	var filePath, fileName, fileContentType string
	var fileSize int64
	msg := &domain.ChatMessage{}
	err := row.Scan(
		&msg.ID, &msg.Room, &msg.From, &msg.Username, &msg.Text,
		&reactionsJSON,
		&msg.ReplyToID, &msg.ReplyToUsername, &msg.ReplyToText,
		&editedInt, &msg.Timestamp, &msgType, &voiceDuration,
		&filePath, &fileName, &fileSize, &fileContentType,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	msg.Type = msgType
	msg.Edited = editedInt != 0
	msg.VoiceDuration = voiceDuration
	if msg.Type == "voice_message" {
		msg.VoiceURL = "/api/v1/chat/messages/" + msg.ID + "/voice"
	}
	if msg.Type == "file_message" && filePath != "" {
		msg.FileURL = "/api/v1/chat/files/" + msg.ID
		msg.FileName = fileName
		msg.FileSize = fileSize
		msg.FileContentType = fileContentType
	}
	if err := json.Unmarshal([]byte(reactionsJSON), &msg.Reactions); err != nil {
		msg.Reactions = map[string][]string{}
	}
	return msg, nil
}

func scanMessageRow(rows *sql.Rows) (*domain.ChatMessage, error) {
	var reactionsJSON string
	var editedInt int
	var msgType string
	var voiceDuration float64
	var filePath, fileName, fileContentType string
	var fileSize int64
	msg := &domain.ChatMessage{}
	err := rows.Scan(
		&msg.ID, &msg.Room, &msg.From, &msg.Username, &msg.Text,
		&reactionsJSON,
		&msg.ReplyToID, &msg.ReplyToUsername, &msg.ReplyToText,
		&editedInt, &msg.Timestamp, &msgType, &voiceDuration,
		&filePath, &fileName, &fileSize, &fileContentType,
	)
	if err != nil {
		return nil, err
	}
	msg.Type = msgType
	msg.Edited = editedInt != 0
	msg.VoiceDuration = voiceDuration
	if msg.Type == "file_message" && filePath != "" {
		msg.FileName = fileName
		msg.FileSize = fileSize
		msg.FileContentType = fileContentType
	}
	if err := json.Unmarshal([]byte(reactionsJSON), &msg.Reactions); err != nil {
		msg.Reactions = map[string][]string{}
	}
	return msg, nil
}

func (r *messageRepository) ClearAllFiles(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE chat_messages SET file_path='', file_name='', file_size=0, file_content_type=''
		 WHERE msg_type='file_message'`)
	return err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
