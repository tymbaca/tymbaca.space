package service

import "context"

func New(repo repo) *Service {
	return &Service{
		repo: repo,
	}
}

type Service struct {
	repo repo
}

type repo interface {
	CreateView(ctx context.Context, url string, addr string) error
}

func (s *Service) CreateView(ctx context.Context, url string, addr string) error {
	return s.repo.CreateView(ctx, url, addr)
}
