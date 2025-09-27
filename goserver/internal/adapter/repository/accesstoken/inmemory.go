package accesstoken

import (
	"context"
	"time"

	cache "github.com/moeryomenko/ttlcache"
)

const (
	defaultCapacity = 1000
	granularity     = 100 * time.Millisecond
)

type accessTokenRepository struct {
	cache *cache.Cache[string, int]
}

func NewAccessTokenRepository(ctx context.Context) *accessTokenRepository {
	return &accessTokenRepository{
		cache: cache.NewCache[string, int](ctx, defaultCapacity, cache.WithTTLEpochGranularity(granularity), cache.WithEvictionPolicy(cache.NOOP)),
	}
}

func (r *accessTokenRepository) Get(token string) (int, bool) {
	return r.cache.Get(token)
}

func (r *accessTokenRepository) Set(userID int, token string, expiresAt time.Time) {
	r.cache.SetNX(token, userID, time.Until(expiresAt))
}

func (r *accessTokenRepository) Delete(token string) {
	r.cache.Remove(token)
}
