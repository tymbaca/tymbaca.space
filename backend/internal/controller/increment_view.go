package controller

import (
	"context"

	backend "github.com/tymbaca/tymbaca.space/backend/api"
	"google.golang.org/grpc/peer"
)

func (c *Controller) IncrementView(ctx context.Context, req *backend.IncrementViewReq) (*backend.IncrementViewResp, error) {
	var clientAddr string
	if p, ok := peer.FromContext(ctx); ok {
		clientAddr = p.Addr.String() // e.g., "192.168.1.10:54321"
	}

	err := c.svc.CreateView(ctx, req.GetUrl(), clientAddr)
	if err != nil {
		return nil, err
	}

	return &backend.IncrementViewResp{}, nil
}
