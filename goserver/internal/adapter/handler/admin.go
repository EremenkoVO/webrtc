package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/EremenkoVO/webrtc/goserver/internal/domain"
)

type setupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type setupStatusResponse struct {
	Initialized bool `json:"initialized"`
}

type adminUserResponse struct {
	ID         string  `json:"id"`
	Username   string  `json:"username"`
	Role       string  `json:"role"`
	CreatedAt  string  `json:"created_at"`
	LastSeenAt *string `json:"last_seen_at,omitempty"`
}

type adminRoomResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	Online    int    `json:"online"`
}

type updateRoleRequest struct {
	Role string `json:"role"`
}

// GetAdminSetupStatus handles GET /api/v1/admin/setup (public)
func (s *ServerWrapper) GetAdminSetupStatus(w http.ResponseWriter, r *http.Request) {
	initialized, err := s.adminService.GetSetupStatus(r.Context())
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, domain.ToErrorResponse(domain.ErrServerError))
		return
	}
	WriteJSONResponse(w, http.StatusOK, setupStatusResponse{Initialized: initialized})
}

// PostAdminSetup handles POST /api/v1/admin/setup (public, one-time)
func (s *ServerWrapper) PostAdminSetup(w http.ResponseWriter, r *http.Request) {
	var req setupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	tokens, err := s.adminService.Setup(r.Context(), req.Username, req.Password)
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	WriteJSONResponse(w, http.StatusOK, convertToAuthTokens(tokens))
}

// GetAdminUsers handles GET /api/v1/admin/users (admin only)
func (s *ServerWrapper) GetAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.adminService.ListUsers(r.Context())
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	resp := make([]adminUserResponse, len(users))
	for i, u := range users {
		r := adminUserResponse{
			ID:        strconv.Itoa(u.ID),
			Username:  u.Username,
			Role:      u.Role,
			CreatedAt: u.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		if u.LastSeenAt != nil {
			s := u.LastSeenAt.Format("2006-01-02 15:04:05")
			r.LastSeenAt = &s
		}
		resp[i] = r
	}
	WriteJSONResponse(w, http.StatusOK, resp)
}

// DeleteAdminUser handles DELETE /api/v1/admin/users/{id} (admin only)
func (s *ServerWrapper) DeleteAdminUser(w http.ResponseWriter, r *http.Request) {
	adminID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	targetIDStr := r.PathValue("id")
	targetID, err := strconv.Atoi(targetIDStr)
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	if err := s.adminService.DeleteUser(r.Context(), adminID, targetID); err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// PatchAdminUserRole handles PATCH /api/v1/admin/users/{id}/role (admin only)
func (s *ServerWrapper) PatchAdminUserRole(w http.ResponseWriter, r *http.Request) {
	adminID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	targetIDStr := r.PathValue("id")
	targetID, err := strconv.Atoi(targetIDStr)
	if err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	var req updateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	if err := s.adminService.UpdateUserRole(r.Context(), adminID, targetID, req.Role); err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAdminRooms handles GET /api/v1/admin/rooms (admin only)
func (s *ServerWrapper) GetAdminRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := s.adminService.ListRooms(r.Context())
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	resp := make([]adminRoomResponse, len(rooms))
	for i, room := range rooms {
		resp[i] = adminRoomResponse{
			ID:        room.ID,
			Name:      room.Name,
			CreatedAt: room.CreatedAt.Format("2006-01-02 15:04:05"),
			Online:    len(room.Clients),
		}
	}
	WriteJSONResponse(w, http.StatusOK, resp)
}

// DeleteAdminRoom handles DELETE /api/v1/admin/rooms/{id} (admin only)
func (s *ServerWrapper) DeleteAdminRoom(w http.ResponseWriter, r *http.Request) {
	adminID, ok := r.Context().Value(contextKeyUserID).(int)
	if !ok {
		WriteErrorResponse(w, http.StatusUnauthorized, domain.ToErrorResponse(domain.ErrUnauthorized))
		return
	}

	roomID := r.PathValue("id")
	if roomID == "" {
		WriteErrorResponse(w, http.StatusBadRequest, domain.ToErrorResponse(domain.ErrValidation))
		return
	}

	if err := s.adminService.DeleteRoom(r.Context(), adminID, roomID); err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAdminStats handles GET /api/v1/admin/stats (admin only)
func (s *ServerWrapper) GetAdminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.adminService.GetStats(r.Context())
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}
	WriteJSONResponse(w, http.StatusOK, stats)
}

// GetAdminAudit handles GET /api/v1/admin/audit (admin only)
func (s *ServerWrapper) GetAdminAudit(w http.ResponseWriter, r *http.Request) {
	events, err := s.adminService.GetAuditLog(r.Context(), 200)
	if err != nil {
		WriteErrorResponse(w, domain.GetStatusCode(err), domain.ToErrorResponse(err))
		return
	}
	WriteJSONResponse(w, http.StatusOK, events)
}
