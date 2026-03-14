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
		ID:                user.ID,
		Username:          user.Username,
		AvatarData:        user.AvatarData,
		AvatarContentType: user.AvatarContentType,
	}, nil
}

func (s *userService) UploadAvatar(ctx context.Context, userID int, data []byte, contentType string) error {
	if err := s.userRepo.UpdateAvatar(ctx, userID, data, contentType); err != nil {
		return domain.ErrServerError
	}
	return nil
}

func (s *userService) GetAvatar(ctx context.Context, username string) ([]byte, string, error) {
	data, contentType, err := s.userRepo.GetAvatarByUsername(ctx, username)
	if err != nil {
		return nil, "", domain.ErrServerError
	}
	if len(data) == 0 {
		return nil, "", domain.ErrUserNotFound
	}
	return data, contentType, nil
}
