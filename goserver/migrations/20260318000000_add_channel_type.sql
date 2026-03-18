-- +goose Up
ALTER TABLE rooms ADD COLUMN type TEXT NOT NULL DEFAULT 'voice';

-- +goose Down
SELECT 1; -- SQLite does not support DROP COLUMN on older versions
