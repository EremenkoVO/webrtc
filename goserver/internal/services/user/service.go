package service

import (
	"context"
	"net/url"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type userService struct {
	userRepo ports.UserRepository
}

const (
	maxDisplayNameLen = 64
	maxBioLen         = 280
	maxStatusTextLen  = 80
	maxStatusEmojiLen = 16
	maxURLLen         = 256
)

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
		DisplayName:       user.DisplayName,
		Bio:               user.Bio,
		StatusText:        user.StatusText,
		StatusEmoji:       user.StatusEmoji,
		BannerURL:         user.BannerURL,
		WebsiteURL:        user.WebsiteURL,
		Role:              user.Role,
	}, nil
}

func (s *userService) ListPublicDirectory(ctx context.Context) ([]*domain.UserDirectoryEntry, error) {
	entries, err := s.userRepo.ListUsersForDirectory(ctx)
	if err != nil {
		return nil, domain.ErrServerError
	}
	return entries, nil
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

func (s *userService) ChangePassword(ctx context.Context, userID int, currentPassword, newPassword string) error {
	if currentPassword == "" || newPassword == "" {
		return domain.ErrValidation
	}

	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return domain.ErrServerError
	}
	if user == nil {
		return domain.ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(currentPassword)); err != nil {
		return domain.ErrInvalidCredentials
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return domain.ErrServerError
	}

	if err := s.userRepo.UpdatePassword(ctx, userID, string(hashed)); err != nil {
		return domain.ErrServerError
	}

	return nil
}

func (s *userService) UpdateProfile(ctx context.Context, userID int, profile *domain.User) (*domain.User, error) {
	if profile == nil {
		return nil, domain.ErrValidation
	}

	candidate := &domain.User{
		DisplayName:        strings.TrimSpace(profile.DisplayName),
		Bio:                strings.TrimSpace(profile.Bio),
		StatusText:         strings.TrimSpace(profile.StatusText),
		StatusEmoji:        strings.TrimSpace(profile.StatusEmoji),
		BannerURL:          strings.TrimSpace(profile.BannerURL),
		WebsiteURL:         strings.TrimSpace(profile.WebsiteURL),
	}

	if !validProfile(candidate) {
		return nil, domain.ErrValidation
	}

	if err := s.userRepo.UpdateProfile(ctx, userID, candidate); err != nil {
		return nil, domain.ErrServerError
	}

	return s.GetProfile(ctx, userID)
}

func (s *userService) GetPublicProfileByUsername(ctx context.Context, username string) (*domain.User, error) {
	profile, err := s.userRepo.FindByUsernamePublic(ctx, strings.TrimSpace(username))
	if err != nil {
		return nil, domain.ErrServerError
	}
	if profile == nil {
		return nil, domain.ErrUserNotFound
	}
	return profile, nil
}

func defaultVisibility(v string) string {
	switch v {
	case domain.ProfileVisibilityPublic, domain.ProfileVisibilityContacts, domain.ProfileVisibilityPrivate:
		return v
	default:
		return domain.ProfileVisibilityPublic
	}
}

func validProfile(p *domain.User) bool {
	if len(p.DisplayName) > maxDisplayNameLen || len(p.Bio) > maxBioLen || len(p.StatusText) > maxStatusTextLen {
		return false
	}
	if len(p.StatusEmoji) > maxStatusEmojiLen {
		return false
	}
	if len(p.BannerURL) > maxURLLen || len(p.WebsiteURL) > maxURLLen {
		return false
	}
	if !isValidURLOrEmpty(p.BannerURL) || !isValidURLOrEmpty(p.WebsiteURL) {
		return false
	}
	return true
}

func isValidVisibility(v string) bool {
	return v == domain.ProfileVisibilityPublic || v == domain.ProfileVisibilityContacts || v == domain.ProfileVisibilityPrivate
}

func isValidURLOrEmpty(raw string) bool {
	if raw == "" {
		return true
	}
	u, err := url.ParseRequestURI(raw)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}
