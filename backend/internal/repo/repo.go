package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/Masterminds/squirrel"
	"github.com/jackc/pgx/v5/pgxpool"
)

func New(pool *pgxpool.Pool) *Repo {
	return &Repo{
		pool: pool,
	}
}

type Repo struct {
	pool *pgxpool.Pool
}

func (r *Repo) CreateView(ctx context.Context, url string, addr string) error {
	sql, args, err := squirrel.Insert("views").
		Columns("url", "addr", "dt").
		Values(url, addr, time.Now()).
		PlaceholderFormat(squirrel.Dollar).ToSql()
	if err != nil {
		return fmt.Errorf("build query: %w", err)
	}

	_, err = r.pool.Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}

	return nil
}
