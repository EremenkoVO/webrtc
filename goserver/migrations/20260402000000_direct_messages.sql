-- +goose Up
CREATE TABLE IF NOT EXISTS direct_conversations (
    id TEXT PRIMARY KEY,
    pair_key TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS direct_conversation_participants (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_direct_conversation_participants_user
    ON direct_conversation_participants(user_id, conversation_id);

ALTER TABLE chat_messages ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'channel';
ALTER TABLE chat_messages ADD COLUMN scope_id TEXT NOT NULL DEFAULT '';

UPDATE chat_messages
SET scope_type = 'channel',
    scope_id = room_id
WHERE scope_id = '';

CREATE INDEX IF NOT EXISTS idx_chat_messages_scope
    ON chat_messages(scope_type, scope_id, created_at);

-- +goose Down
DROP INDEX IF EXISTS idx_chat_messages_scope;
DROP INDEX IF EXISTS idx_direct_conversation_participants_user;
DROP TABLE IF EXISTS direct_conversation_participants;
DROP TABLE IF EXISTS direct_conversations;
