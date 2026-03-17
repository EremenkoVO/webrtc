package domain

import "time"

const (
	AuditEventUserRegister    = "user_register"
	AuditEventUserLogin       = "user_login"
	AuditEventUserLogout      = "user_logout"
	AuditEventRoomCreate      = "room_create"
	AuditEventRoomDelete      = "room_delete"
	AuditEventAdminSetup      = "admin_setup"
	AuditEventAdminDeleteUser = "admin_delete_user"
	AuditEventAdminChangeRole = "admin_change_role"
)

type AuditEvent struct {
	ID        int       `json:"id"`
	EventType string    `json:"event_type"`
	Actor     string    `json:"actor"`
	Target    string    `json:"target"`
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"created_at"`
}
