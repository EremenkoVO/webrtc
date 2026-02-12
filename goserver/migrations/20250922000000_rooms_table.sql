-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS rooms (
	id         TEXT PRIMARY KEY,
	name       TEXT    NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS rooms;
-- +goose StatementEnd
