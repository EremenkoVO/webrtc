-- +goose Up
ALTER TABLE chat_messages ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN file_content_type TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite <3.35 does not support DROP COLUMN; migration is irreversible
