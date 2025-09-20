package api

type Server struct{}

var _ ServerInterface = (*Server)(nil)

func New() *Server {
	return &Server{}
}
