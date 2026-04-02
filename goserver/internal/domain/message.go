package domain

import "time"

type DirectConversation struct {
	ID           string
	PairKey      string
	Participants []*DirectConversationParticipant
	LastMessage  *ChatMessage
	UnreadCount  int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type DirectConversationParticipant struct {
	UserID      int
	Username    string
	DisplayName string
}
