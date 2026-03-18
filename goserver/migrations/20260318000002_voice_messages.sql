-- +goose Up
ALTER TABLE chat_messages ADD COLUMN msg_type TEXT NOT NULL DEFAULT 'chat_message';
ALTER TABLE chat_messages ADD COLUMN voice_data BLOB;
ALTER TABLE chat_messages ADD COLUMN voice_content_type TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN voice_duration REAL NOT NULL DEFAULT 0.0;

-- +goose Down
-- SQLite does not support DROP COLUMN without recreating the table; left intentionally empty
