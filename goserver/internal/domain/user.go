package domain

import "time"

type User struct {
	ID                int
	Username          string
	Password          string
	CreatedAt         time.Time
	LastSeenAt        *time.Time
	AvatarData        []byte
	AvatarContentType string
	Role              string // "user" | "admin"
	BootstrapAdmin    bool   // first / setup admin — role cannot be demoted to user
}
