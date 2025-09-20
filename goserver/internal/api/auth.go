package api

import "net/http"

// User login
// (POST /api/v1/auth/login)
func (s *Server) LoginUser(w http.ResponseWriter, r *http.Request) {}

// Logout user
// (POST /api/v1/auth/logout)
func (s *Server) LogoutUser(w http.ResponseWriter, r *http.Request) {}

// Refresh access token
// (POST /api/v1/auth/refresh)
func (s *Server) RefreshToken(w http.ResponseWriter, r *http.Request) {}

// Register new user
// (POST /api/v1/auth/register)
func (s *Server) RegisterUser(w http.ResponseWriter, r *http.Request) {}

// Get current user profile
// (GET /api/v1/me)
func (s *Server) GetCurrentUser(w http.ResponseWriter, r *http.Request) {}
