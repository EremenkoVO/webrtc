package dm

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type Service struct {
	repo    ports.DirectConversationRepository
	msgRepo ports.ChatMessageRepository
}

func NewDMService(repo ports.DirectConversationRepository, msgRepo ports.ChatMessageRepository) *Service {
	return &Service{repo: repo, msgRepo: msgRepo}
}

func pairKey(a, b int) string {
	ids := []int{a, b}
	sort.Ints(ids)
	return strconv.Itoa(ids[0]) + ":" + strconv.Itoa(ids[1])
}

func (s *Service) CreateOrGet(ctx context.Context, userID int, peerUserID int) (*domain.DirectConversation, bool, error) {
	if userID <= 0 || peerUserID <= 0 || userID == peerUserID {
		return nil, false, fmt.Errorf("invalid direct conversation pair")
	}
	key := pairKey(userID, peerUserID)
	existing, err := s.repo.GetByPairKey(ctx, key)
	if err != nil {
		return nil, false, err
	}
	if existing != nil {
		out, err := s.Get(ctx, userID, existing.ID)
		return out, false, err
	}

	now := time.Now().UTC()
	conv := &domain.DirectConversation{
		ID:        uuid.NewString(),
		PairKey:   key,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.repo.Create(ctx, conv); err != nil {
		// Handle race: another request could create the same pair concurrently.
		created, getErr := s.repo.GetByPairKey(ctx, key)
		if getErr == nil && created != nil {
			out, outErr := s.Get(ctx, userID, created.ID)
			return out, false, outErr
		}
		return nil, false, err
	}
	if err := s.repo.AddParticipant(ctx, conv.ID, userID); err != nil {
		return nil, false, err
	}
	if err := s.repo.AddParticipant(ctx, conv.ID, peerUserID); err != nil {
		return nil, false, err
	}

	out, err := s.Get(ctx, userID, conv.ID)
	return out, true, err
}

func (s *Service) Get(ctx context.Context, userID int, conversationID string) (*domain.DirectConversation, error) {
	ok, err := s.repo.IsParticipant(ctx, conversationID, userID)
	if err != nil || !ok {
		return nil, err
	}
	conv, err := s.repo.GetByID(ctx, conversationID)
	if err != nil || conv == nil {
		return nil, err
	}
	participants, err := s.repo.ListParticipants(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	conv.Participants = participants
	last, err := s.msgRepo.ListByScope(ctx, "dm", conversationID, 1)
	if err == nil && len(last) > 0 {
		conv.LastMessage = last[0]
	}
	conv.UnreadCount = 0
	return conv, nil
}

func (s *Service) ListByUserID(ctx context.Context, userID int) ([]*domain.DirectConversation, error) {
	convs, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	for _, conv := range convs {
		participants, err := s.repo.ListParticipants(ctx, conv.ID)
		if err != nil {
			return nil, err
		}
		conv.Participants = participants
		last, err := s.msgRepo.ListByScope(ctx, "dm", conv.ID, 1)
		if err == nil && len(last) > 0 {
			conv.LastMessage = last[0]
		}
		conv.UnreadCount = 0
	}
	return convs, nil
}

func (s *Service) IsParticipant(ctx context.Context, userID int, conversationID string) (bool, error) {
	return s.repo.IsParticipant(ctx, conversationID, userID)
}
