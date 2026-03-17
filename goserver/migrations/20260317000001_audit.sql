-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN last_seen_at DATETIME;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  event_type TEXT     NOT NULL,
  actor      TEXT     NOT NULL DEFAULT '',
  target     TEXT     NOT NULL DEFAULT '',
  details    TEXT     NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN last_seen_at;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS audit_log;
-- +goose StatementEnd
