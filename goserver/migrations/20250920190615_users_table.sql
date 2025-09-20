-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "users" (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT    UNIQUE NOT NULL,
	password TEXT           NOT NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "users";
-- +goose StatementEnd
