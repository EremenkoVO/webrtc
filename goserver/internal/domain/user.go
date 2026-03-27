package domain

import "time"

const (
	ProfileVisibilityPublic   = "public"
	ProfileVisibilityContacts = "contacts"
	ProfileVisibilityPrivate  = "private"
)

type User struct {
	ID                int
	Username          string
	Password          string
	CreatedAt         time.Time
	LastSeenAt        *time.Time
	AvatarData        []byte
	AvatarContentType string
	DisplayName       string
	Bio               string
	StatusText        string
	StatusEmoji       string
	BannerURL         string
	WebsiteURL        string
	Pronouns          string
	Location          string
	BioVisibility     string
	WebsiteVisibility string
	LocationVisibility string
	LastSeenVisibility string
	Role              string // "user" | "admin"
	BootstrapAdmin    bool   // first / setup admin — role cannot be demoted to user
}

// UserDirectoryEntry is one row for the public user directory (no secrets, no role).
type UserDirectoryEntry struct {
	ID         int
	Username   string
	DisplayName string
	HasAvatar  bool
	LastSeenAt *time.Time
}
