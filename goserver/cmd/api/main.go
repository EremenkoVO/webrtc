package main

import (
	"log"

	"github.com/moeryomenko/squad"

	"github.com/EremenkoVO/webrtc/goserver/internal/app"
)

func main() {
	app := app.API{}

	s, err := squad.New(
		squad.WithBootstrap(app.Init),
		squad.WithSignalHandler(),
	)
	if err != nil {
		log.Fatalf("failed start server: %s", err)
	}

	s.RunServer(app.Server())

	err = s.Wait()
	if err != nil {
		log.Fatalf("failed stop server: %s", err)
	}
}
