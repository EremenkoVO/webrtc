package main

import (
	"log"

	"github.com/moeryomenko/squad"
)

func main() {
	s, err := squad.New(squad.WithSignalHandler())
	if err != nil {
		log.Fatalf("failed start server: %s", err)
	}

	s.RunServer(nil)

	err = s.Wait()
	if err != nil {
		log.Fatalf("failed stop server: %s", err)
	}
}
