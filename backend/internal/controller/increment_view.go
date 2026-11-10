package controller

import (
	"context"

	backend "github.com/tymbaca/tymbaca.space/backend/api"
)

func (c *Controller) IncrementView(ctx context.Context, req *backend.IncrementViewReq) (*backend.IncrementViewResp, error) {
	err := c.svc.CreateView(ctx, req.GetUrl(), req.GetClientAddr())
	if err != nil {
		return nil, err
	}

	return &backend.IncrementViewResp{}, nil
}
