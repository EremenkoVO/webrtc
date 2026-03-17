package admin

import (
	"context"
	"strconv"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
	"github.com/EremenkoVO/webrtc/goserver/internal/ports"
)

type adminService struct {
	userRepo  ports.UserRepository
	roomRepo  ports.RoomRepository
	authSvc   ports.AuthService
	roomSvc   ports.RoomService
	auditRepo ports.AuditRepository
}

func NewAdminService(
	userRepo ports.UserRepository,
	roomRepo ports.RoomRepository,
	authSvc ports.AuthService,
	roomSvc ports.RoomService,
	auditRepo ports.AuditRepository,
) ports.AdminService {
	return &adminService{
		userRepo:  userRepo,
		roomRepo:  roomRepo,
		authSvc:   authSvc,
		roomSvc:   roomSvc,
		auditRepo: auditRepo,
	}
}

func (s *adminService) GetSetupStatus(ctx context.Context) (bool, error) {
	return s.userRepo.HasAdmin(ctx)
}

func (s *adminService) Setup(ctx context.Context, username, password string) (*domain.AuthTokens, error) {
	if username == "" || password == "" {
		return nil, domain.ErrValidation
	}

	hasAdmin, err := s.userRepo.HasAdmin(ctx)
	if err != nil {
		return nil, domain.ErrServerError
	}
	if hasAdmin {
		return nil, domain.ErrAdminAlreadyInitialized
	}

	existing, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		return nil, domain.ErrServerError
	}

	if existing != nil {
		// Verify password of existing user and promote to admin
		if err := bcrypt.CompareHashAndPassword([]byte(existing.Password), []byte(password)); err != nil {
			return nil, domain.ErrInvalidCredentials
		}
		if err := s.userRepo.UpdateUserRole(ctx, existing.ID, "admin"); err != nil {
			return nil, domain.ErrServerError
		}
	} else {
		// Create new admin user
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, domain.ErrServerError
		}
		user := &domain.User{
			ID:       int(time.Now().UnixNano()),
			Username: username,
			Password: string(hashedPassword),
			Role:     "admin",
		}
		if err := s.userRepo.CreateUser(ctx, user); err != nil {
			return nil, domain.ErrServerError
		}
	}

	_ = s.auditRepo.LogEvent(ctx, domain.AuditEventAdminSetup, username, "", "admin panel initialized")

	return s.authSvc.Login(ctx, username, password)
}

func (s *adminService) GetUserRole(ctx context.Context, userID int) (string, error) {
	role, err := s.userRepo.GetUserRole(ctx, userID)
	if err != nil {
		return "", domain.ErrServerError
	}
	return role, nil
}

func (s *adminService) ListUsers(ctx context.Context) ([]*domain.User, error) {
	users, err := s.userRepo.ListUsers(ctx)
	if err != nil {
		return nil, domain.ErrServerError
	}
	return users, nil
}

func (s *adminService) DeleteUser(ctx context.Context, adminID, targetID int) error {
	if adminID == targetID {
		return domain.ErrForbidden
	}

	target, _ := s.userRepo.FindByID(ctx, targetID)
	targetName := strconv.Itoa(targetID)
	if target != nil {
		targetName = target.Username
	}

	if err := s.userRepo.DeleteUser(ctx, targetID); err != nil {
		return domain.ErrServerError
	}

	admin, _ := s.userRepo.FindByID(ctx, adminID)
	actorName := strconv.Itoa(adminID)
	if admin != nil {
		actorName = admin.Username
	}
	_ = s.auditRepo.LogEvent(ctx, domain.AuditEventAdminDeleteUser, actorName, targetName, "")

	return nil
}

func (s *adminService) UpdateUserRole(ctx context.Context, adminID, targetID int, role string) error {
	if adminID == targetID {
		return domain.ErrForbidden
	}
	if role != "user" && role != "admin" {
		return domain.ErrValidation
	}
	if err := s.userRepo.UpdateUserRole(ctx, targetID, role); err != nil {
		return domain.ErrServerError
	}

	admin, _ := s.userRepo.FindByID(ctx, adminID)
	actorName := strconv.Itoa(adminID)
	if admin != nil {
		actorName = admin.Username
	}
	target, _ := s.userRepo.FindByID(ctx, targetID)
	targetName := strconv.Itoa(targetID)
	if target != nil {
		targetName = target.Username
	}
	_ = s.auditRepo.LogEvent(ctx, domain.AuditEventAdminChangeRole, actorName, targetName, role)

	return nil
}

func (s *adminService) ListRooms(ctx context.Context) ([]*domain.Room, error) {
	rooms, err := s.roomRepo.ListRooms(ctx)
	if err != nil {
		return nil, domain.ErrServerError
	}
	return rooms, nil
}

func (s *adminService) DeleteRoom(ctx context.Context, adminID int, roomID string) error {
	if err := s.roomRepo.DeleteRoom(ctx, roomID); err != nil {
		return domain.ErrServerError
	}

	admin, _ := s.userRepo.FindByID(ctx, adminID)
	actorName := strconv.Itoa(adminID)
	if admin != nil {
		actorName = admin.Username
	}
	_ = s.auditRepo.LogEvent(ctx, domain.AuditEventRoomDelete, actorName, roomID, "")

	return nil
}

func (s *adminService) GetAuditLog(ctx context.Context, limit int) ([]*domain.AuditEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	events, err := s.auditRepo.ListEvents(ctx, limit)
	if err != nil {
		return nil, domain.ErrServerError
	}
	return events, nil
}

func (s *adminService) GetStats(ctx context.Context) (*domain.AdminStats, error) {
	users, err := s.userRepo.ListUsers(ctx)
	if err != nil {
		return nil, domain.ErrServerError
	}

	rooms := s.roomSvc.ListRooms()

	onlineUsers := 0
	for _, room := range rooms {
		onlineUsers += len(room.Clients)
	}

	return &domain.AdminStats{
		TotalUsers:  len(users),
		TotalRooms:  len(rooms),
		OnlineUsers: onlineUsers,
	}, nil
}
