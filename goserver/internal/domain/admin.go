package domain

type AdminStats struct {
	TotalUsers  int `json:"total_users"`
	TotalRooms  int `json:"total_rooms"`
	OnlineUsers int `json:"online_users"`
}
