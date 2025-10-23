package main

import (
	"log"

	"github.com/moeryomenko/healing"
	"github.com/moeryomenko/squad"

	"github.com/EremenkoVO/webrtc/goserver/internal/app"
)

func main() {
	app := app.API{
		Health: healing.New(8081),
	}

	s, err := squad.New(
		squad.WithSubsystem(app.Init()),
		squad.WithSignalHandler(),
	)
	if err != nil {
		log.Fatalf("failed start server: %s", err)
	}

	s.RunGracefully(app.Health.Heartbeat, app.Health.Stop)
	s.RunServer(app.Server())

	err = s.Wait()
	if err != nil {
		log.Fatalf("failed stop server: %s", err)
	}
}
