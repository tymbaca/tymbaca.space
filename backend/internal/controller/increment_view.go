package controller

import (
	"context"
	"strings"

	backend "github.com/tymbaca/tymbaca.space/backend/api"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
)

func (c *Controller) IncrementView(ctx context.Context, req *backend.IncrementViewReq) (*backend.IncrementViewResp, error) {
	err := c.svc.CreateView(ctx, req.GetUrl(), getClientIP(ctx))
	if err != nil {
		return nil, err
	}

	return &backend.IncrementViewResp{}, nil
}

func getClientIP(ctx context.Context) string {
	var clientAddr string
	if p, ok := peer.FromContext(ctx); ok {
		clientAddr = p.Addr.String() // e.g., "192.168.1.10:54321"
	}

	if clientAddr != "" {
		return clientAddr
	}

	if md, ok := metadata.FromIncomingContext(ctx); ok {
		// grpc-gateway usually forwards the IP in "x-forwarded-for"
		forwardedFor := md.Get("x-forwarded-for")
		if len(forwardedFor) > 0 && forwardedFor[0] != "" {
			// The header can be a comma-separated list; the first IP is the original client.
			ips := strings.Split(forwardedFor[0], ",")
			if len(ips) > 0 {
				return strings.TrimSpace(ips[0])
			}
		}
	}
	return ""
}
