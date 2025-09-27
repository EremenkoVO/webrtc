package cache

import (
	"sync"
	"time"
)

type TokenInfo struct {
	UserID    int
	ExpiresAt time.Time
}

type TokenCache struct {
	tokens map[string]TokenInfo
	mutex  sync.RWMutex
}

func NewTokenCache() *TokenCache {
	cache := &TokenCache{
		tokens: make(map[string]TokenInfo),
	}

	// Start cleanup goroutine to remove expired tokens
	go cache.cleanup()

	return cache
}

func (c *TokenCache) Set(token string, userID int, expiresAt time.Time) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.tokens[token] = TokenInfo{
		UserID:    userID,
		ExpiresAt: expiresAt,
	}
}

func (c *TokenCache) Get(token string) (int, bool) {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	info, exists := c.tokens[token]
	if !exists {
		return 0, false
	}

	// Check if token is expired
	if time.Now().After(info.ExpiresAt) {
		// Token is expired, remove it
		go func() {
			c.mutex.Lock()
			delete(c.tokens, token)
			c.mutex.Unlock()
		}()
		return 0, false
	}

	return info.UserID, true
}

func (c *TokenCache) Delete(token string) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	delete(c.tokens, token)
}

func (c *TokenCache) DeleteByUserID(userID int) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	for token, info := range c.tokens {
		if info.UserID == userID {
			delete(c.tokens, token)
		}
	}
}

// cleanup runs periodically to remove expired tokens
func (c *TokenCache) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mutex.Lock()
		now := time.Now()
		for token, info := range c.tokens {
			if now.After(info.ExpiresAt) {
				delete(c.tokens, token)
			}
		}
		c.mutex.Unlock()
	}
}

func (c *TokenCache) Size() int {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	return len(c.tokens)
}

func (c *TokenCache) Has(token string) bool {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	_, exists := c.tokens[token]
	return exists
}
