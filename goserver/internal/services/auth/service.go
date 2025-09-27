package service

import (
	"context"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/pkg/jwt"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type authService struct {
	userRepo   ports.UserRepository
	tokenRepo  ports.TokenRepository
	jwt        *jwt.JWTManager
	tokenCache ports.AccessTokenRepository
}

func NewAuthService(
	userRepo ports.UserRepository,
	tokenRepo ports.TokenRepository,
	jwt *jwt.JWTManager,
	tokenCache ports.AccessTokenRepository,
) ports.AuthService {
	return &authService{
		userRepo:   userRepo,
		tokenRepo:  tokenRepo,
		jwt:        jwt,
		tokenCache: tokenCache,
	}
}

func (s *authService) Register(ctx context.Context, username, password string) (*domain.AuthTokens, error) {
	// Validate input
	if password == "" || username == "" {
		return nil, domain.ErrValidation
	}

	// Check if user exists
	exists, err := s.userRepo.UserExists(ctx, username)
	if err != nil {
		return nil, domain.ErrServerError
	}
	if exists {
		return nil, domain.ErrUserExists
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, domain.ErrServerError
	}

	// Create user
	user := &domain.User{
		ID:       generateID(),
		Username: username,
		Password: string(hashedPassword),
	}

	err = s.userRepo.CreateUser(ctx, user)
	if err != nil {
		return nil, domain.ErrServerError
	}

	// Generate tokens
	return s.generateTokens(ctx, user.ID)
}

func (s *authService) Login(ctx context.Context, username, password string) (*domain.AuthTokens, error) {
	if username == "" || password == "" {
		return nil, domain.ErrValidation
	}

	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		return nil, domain.ErrServerError
	}
	if user == nil {
		return nil, domain.ErrInvalidCredentials
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}

	return s.generateTokens(ctx, user.ID)
}

func (s *authService) RefreshToken(ctx context.Context, refreshToken string) (*domain.AuthTokens, error) {
	if refreshToken == "" {
		return nil, domain.ErrValidation
	}

	// Validate refresh token
	userID, err := s.jwt.ValidateToken(refreshToken)
	if err != nil {
		return nil, domain.ErrInvalidRefreshToken
	}

	// Check if refresh token exists in database
	token, err := s.tokenRepo.FindRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, domain.ErrServerError
	}
	if token == nil {
		return nil, domain.ErrInvalidRefreshToken
	}

	// Generate new tokens
	tokens, err := s.generateTokens(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Delete old refresh token
	err = s.tokenRepo.DeleteRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, domain.ErrServerError
	}

	return tokens, nil
}

func (s *authService) Logout(ctx context.Context, accessToken string) error {
	userID, err := s.jwt.ValidateToken(accessToken)
	if err != nil {
		return domain.ErrUnauthorized
	}

	s.tokenCache.Delete(accessToken)

	// Remove all refresh tokens from database
	err = s.tokenRepo.DeleteAllRefreshTokens(ctx, userID)
	if err != nil {
		return domain.ErrServerError
	}

	return nil
}

func (s *authService) ValidateToken(ctx context.Context, token string) (int, error) {
	userID, found := s.tokenCache.Get(token)
	if !found {
		return 0, domain.ErrInvalidCredentials
	}

	return userID, nil
}

func (s *authService) generateTokens(ctx context.Context, userID int) (*domain.AuthTokens, error) {
	accessTokenDuration := time.Hour
	refreshTokenDuration := 24 * time.Hour

	accessToken, err := s.jwt.GenerateToken(userID, accessTokenDuration)
	if err != nil {
		return nil, domain.ErrServerError
	}

	refreshToken, err := s.jwt.GenerateToken(userID, refreshTokenDuration)
	if err != nil {
		return nil, domain.ErrServerError
	}

	// Parse the generated token to get the exact expiration time and add to cache
	claims, err := s.jwt.ParseToken(accessToken)
	if err != nil {
		return nil, domain.ErrServerError
	}
	s.tokenCache.Set(userID, accessToken, claims.ExpiresAt.Time)

	// Store refresh token
	refreshTokenEntity := &domain.RefreshToken{
		Token:     refreshToken,
		UserID:    userID,
		ExpiresAt: time.Now().Add(refreshTokenDuration),
	}

	err = s.tokenRepo.StoreRefreshToken(ctx, refreshTokenEntity)
	if err != nil {
		return nil, domain.ErrServerError
	}

	return &domain.AuthTokens{
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		ExpiresIn:        3600,
		RefreshExpiresIn: 86400,
	}, nil
}

func generateID() int {
	return int(time.Now().UnixNano())
}
