package domain

import "time"

type User struct {
	ID                int
	Username          string
	Password          string
	CreatedAt         time.Time
	AvatarData        []byte
	AvatarContentType string
}
