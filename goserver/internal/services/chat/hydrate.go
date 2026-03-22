package chat

import (
	"context"
	"log"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

// numericUserID returns true if s is a positive decimal user id string (digits only).
func numericUserID(s string) (int, bool) {
	if s == "" {
		return 0, false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, false
		}
	}
	id, err := strconv.Atoi(s)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func collectIDsFromReactions(reactions map[string][]string) []int {
	if reactions == nil {
		return nil
	}
	seen := make(map[int]struct{})
	var out []int
	for _, list := range reactions {
		for _, v := range list {
			if id, ok := numericUserID(v); ok {
				if _, dup := seen[id]; dup {
					continue
				}
				seen[id] = struct{}{}
				out = append(out, id)
			}
		}
	}
	return out
}

func collectHydrationIDs(msgs []*domain.ChatMessage) []int {
	seen := make(map[int]struct{})
	var out []int
	add := func(id int) {
		if id <= 0 {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	for _, m := range msgs {
		if m == nil {
			continue
		}
		for _, list := range m.Reactions {
			for _, v := range list {
				if id, ok := numericUserID(v); ok {
					add(id)
				}
			}
		}
		if m.Username == m.From {
			if id, ok := numericUserID(m.Username); ok {
				add(id)
			}
		}
		if id, ok := numericUserID(m.ReplyToUsername); ok {
			add(id)
		}
	}
	return out
}

func normalizeReactionMapWithNames(reactions map[string][]string, names map[int]string) {
	if reactions == nil || len(names) == 0 {
		return
	}
	for emoji, list := range reactions {
		seen := make(map[string]struct{}, len(list))
		out := make([]string, 0, len(list))
		for _, v := range list {
			nv := v
			if id, ok := numericUserID(v); ok {
				if n, ok := names[id]; ok && n != "" {
					nv = n
				}
			}
			if _, dup := seen[nv]; dup {
				continue
			}
			seen[nv] = struct{}{}
			out = append(out, nv)
		}
		reactions[emoji] = out
	}
}

func hydrateMessageFields(m *domain.ChatMessage, names map[int]string) {
	if m == nil || len(names) == 0 {
		return
	}
	if m.Username == m.From {
		if id, ok := numericUserID(m.Username); ok {
			if n, ok := names[id]; ok && n != "" {
				m.Username = n
			}
		}
	}
	if id, ok := numericUserID(m.ReplyToUsername); ok {
		if n, ok := names[id]; ok && n != "" {
			m.ReplyToUsername = n
		}
	}
}

func (s *Service) hydrateOutboundMessages(ctx context.Context, msgs []*domain.ChatMessage) {
	if s.userRepo == nil || len(msgs) == 0 {
		return
	}
	ids := collectHydrationIDs(msgs)
	if len(ids) == 0 {
		return
	}
	names, err := s.userRepo.FindUsernamesByIDs(ctx, ids)
	if err != nil {
		log.Printf("chat hydrate user lookup: %v", err)
		return
	}
	for _, m := range msgs {
		hydrateMessageFields(m, names)
	}
	for _, m := range msgs {
		normalizeReactionMapWithNames(m.Reactions, names)
	}
}

func (s *Service) normalizeReactionMapInPlace(ctx context.Context, reactions map[string][]string) error {
	if s.userRepo == nil || reactions == nil {
		return nil
	}
	ids := collectIDsFromReactions(reactions)
	if len(ids) == 0 {
		return nil
	}
	names, err := s.userRepo.FindUsernamesByIDs(ctx, ids)
	if err != nil {
		return err
	}
	normalizeReactionMapWithNames(reactions, names)
	return nil
}

func reactionListContainsUser(list []string, username, userIDStr string) bool {
	for _, v := range list {
		if v == username || v == userIDStr {
			return true
		}
	}
	return false
}

func removeUserFromReactionList(list []string, username, userIDStr string) []string {
	out := list[:0]
	for _, v := range list {
		if v == username || v == userIDStr {
			continue
		}
		out = append(out, v)
	}
	return out
}
