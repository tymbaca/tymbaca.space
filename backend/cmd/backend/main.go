package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tymbaca/tymbaca.space/backend/internal/controller"
	"github.com/tymbaca/tymbaca.space/backend/internal/repo"
	"github.com/tymbaca/tymbaca.space/backend/internal/service"
)

type Config struct {
	DatabaseURL string `env:"DATABASE_URL,required"`

	GRPCAddr string `env:"GRPC_ADDR" envDefault:":50051"`
	HTTPAddr string `env:"HTTP_ADDR" envDefault:":8080"`

	ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" envDefault:"10s"`
}

func main() {
	if err := run(); err != nil {
		slog.Error("service failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("create postgres pool: %w", err)
	}
	defer pool.Close()

	pingCtx, cancelPing := context.WithTimeout(ctx, 5*time.Second)
	err = pool.Ping(pingCtx)
	cancelPing()
	if err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}

	svc := service.New(repo.New(pool))
	ctrl := controller.New(svc)

	return ctrl.Run(ctx, cfg.GRPCAddr, cfg.HTTPAddr, cfg.ShutdownTimeout)
}
