package domain

import "time"

type AuthTokens struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshExpiresIn int    `json:"refresh_expires_in"`
}

type RefreshToken struct {
	Token     string    `json:"-"`
	UserID    int       `json:"-"`
	ExpiresAt time.Time `json:"-"`
}
