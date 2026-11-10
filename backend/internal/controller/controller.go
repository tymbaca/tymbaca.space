package controller

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	backend "github.com/tymbaca/tymbaca.space/backend/api"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func New(svc service) *Controller {
	return &Controller{svc: svc}
}

type Controller struct {
	backend.UnimplementedBackendServiceServer

	svc service
}

type service interface {
	CreateView(ctx context.Context, url string, addr string) error
}

// Run starts the gRPC server and the HTTP gateway and blocks until ctx is
// canceled or one of the servers fails.
func (c *Controller) Run(ctx context.Context, grpcAddr, httpAddr string, shutdownTimeout time.Duration) error {
	grpcServer := grpc.NewServer()
	backend.RegisterBackendServiceServer(grpcServer, c)
	reflection.Register(grpcServer)

	grpcListener, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		return fmt.Errorf("listen grpc on %s: %w", grpcAddr, err)
	}
	defer grpcListener.Close()

	httpMux := runtime.NewServeMux()
	if err := backend.RegisterBackendServiceHandlerServer(ctx, httpMux, c); err != nil {
		return fmt.Errorf("register http gateway: %w", err)
	}

	httpServer := &http.Server{
		Addr:              httpAddr,
		Handler:           httpMux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 2)

	go func() {
		slog.Info("grpc server listening", "addr", grpcAddr)
		if err := grpcServer.Serve(grpcListener); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			errCh <- fmt.Errorf("serve grpc: %w", err)
		}
	}()

	go func() {
		slog.Info("http gateway listening", "addr", httpAddr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("serve http: %w", err)
		}
	}()

	select {
	case err := <-errCh:
		shutdown(httpServer, grpcServer, shutdownTimeout)
		return err
	case <-ctx.Done():
		slog.Info("shutdown signal received")
		shutdown(httpServer, grpcServer, shutdownTimeout)
		return nil
	}
}

func shutdown(httpServer *http.Server, grpcServer *grpc.Server, timeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Warn("http gateway shutdown failed", "error", err)
	}

	stopped := make(chan struct{})
	go func() {
		grpcServer.GracefulStop()
		close(stopped)
	}()

	select {
	case <-stopped:
	case <-ctx.Done():
		grpcServer.Stop()
		slog.Warn("grpc graceful shutdown timed out")
	}
}
