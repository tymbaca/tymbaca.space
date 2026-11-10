-- +goose Up
CREATE TABLE IF NOT EXISTS views (
    url  text NOT NULL,
    addr text NOT NULL,
    dt   timestamptz NOT NULL
);

CREATE INDEX idx_views_url ON views (url);

-- +goose Down
DROP TABLE IF EXISTS views;
