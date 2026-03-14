-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN avatar BLOB;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN avatar_content_type TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN avatar;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN avatar_content_type;
-- +goose StatementEnd
