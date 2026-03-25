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

// UserDirectoryEntry is one row for the public user directory (no secrets, no role).
type UserDirectoryEntry struct {
	ID        int
	Username  string
	HasAvatar bool
}
