-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN status_text TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN status_emoji TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN banner_url TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN website_url TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN bio_visibility TEXT NOT NULL DEFAULT 'public';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN website_visibility TEXT NOT NULL DEFAULT 'public';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN location_visibility TEXT NOT NULL DEFAULT 'public';
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users ADD COLUMN last_seen_visibility TEXT NOT NULL DEFAULT 'public';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN last_seen_visibility;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN location_visibility;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN website_visibility;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN bio_visibility;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN location;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN pronouns;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN website_url;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN banner_url;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN status_emoji;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN status_text;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN bio;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE users DROP COLUMN display_name;
-- +goose StatementEnd
