-- +goose Up
CREATE TABLE IF NOT EXISTS chat_messages (
    id                TEXT PRIMARY KEY,
    room_id           TEXT NOT NULL,
    from_user         TEXT NOT NULL,
    username          TEXT NOT NULL,
    text              TEXT NOT NULL,
    reactions         TEXT NOT NULL DEFAULT '{}',
    reply_to_id       TEXT NOT NULL DEFAULT '',
    reply_to_username TEXT NOT NULL DEFAULT '',
    reply_to_text     TEXT NOT NULL DEFAULT '',
    edited            INTEGER NOT NULL DEFAULT 0,
    created_at        DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room
    ON chat_messages(room_id, created_at);

-- +goose Down
DROP TABLE IF EXISTS chat_messages;
