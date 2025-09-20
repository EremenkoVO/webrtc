package api

import "net/http"

type Server struct{}

var _ ServerInterface = (*Server)(nil)

func New() *Server {
	return &Server{}
}

// Register
// (POST /api/auth/register)
func (s *Server) RegisterApiAuthRegisterPost(w http.ResponseWriter, r *http.Request) {}

// Login
// (POST /api/auth/login)
func (s *Server) LoginApiAuthLoginPost(w http.ResponseWriter, r *http.Request) {}

// Get Current User
// (GET /api/auth/me)
func (s *Server) GetCurrentUserApiAuthMeGet(w http.ResponseWriter, r *http.Request) {}

// Get Channels
// (GET /api/channels/)
func (s *Server) GetChannelsApiChannelsGet(w http.ResponseWriter, r *http.Request) {}

// Create Channel
// (POST /api/channels/)
func (s *Server) CreateChannelApiChannelsPost(w http.ResponseWriter, r *http.Request) {}

// Health Check
// (GET /api/health)
func (s *Server) HealthCheckApiHealthGet(w http.ResponseWriter, r *http.Request) {}

// Create Message
// (POST /api/messages/)
func (s *Server) CreateMessageApiMessagesPost(w http.ResponseWriter, r *http.Request) {}

// Get Messages
// (GET /api/messages/channel/{channel_id})
func (s *Server) GetMessagesApiMessagesChannelChannelIdGet(
	w http.ResponseWriter,
	r *http.Request,
	channelId int,
	params GetMessagesApiMessagesChannelChannelIdGetParams,
) {
}
