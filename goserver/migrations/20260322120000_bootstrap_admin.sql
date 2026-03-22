-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN bootstrap_admin INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- First admin by account creation time keeps admin rights permanently (demotion blocked in app).
-- +goose StatementBegin
UPDATE users SET bootstrap_admin = 1 WHERE id IN (
  SELECT id FROM (
    SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC, id ASC LIMIT 1
  )
);
-- +goose StatementEnd

-- +goose Down
-- SQLite: ADD COLUMN is not dropped here (same pattern as other migrations)
