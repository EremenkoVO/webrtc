package service

import (
	"context"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type userService struct {
	userRepo ports.UserRepository
}

func NewUserService(userRepo ports.UserRepository) ports.UserService {
	return &userService{userRepo: userRepo}
}

func (s *userService) GetProfile(ctx context.Context, userID int) (*domain.User, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, domain.ErrServerError
	}
	if user == nil {
		return nil, domain.ErrUserNotFound
	}

	return &domain.User{
		ID:       user.ID,
		Username: user.Username,
	}, nil
}
