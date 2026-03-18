package config

import "fmt"

type Config struct {
	Port      int       `envconfig:"PORT"      default:"8080"`
	Logger    Logger    `envconfig:"LOGGER"`
	Database  *Database `envconfig:"DATABASE"`
	Auth      *Auth     `envconfig:"AUTH"`
	UploadDir string    `envconfig:"UPLOAD_DIR" default:"./uploads"`
}

func (c *Config) ListenAddr() string {
	return fmt.Sprintf(":%d", c.Port)
}

type Logger struct {
	Level string `envconfig:"LEVEL"`
}

type Auth struct {
	TokenSecret string `envconfig:"TOKEN_SECRET"`
}

type Database struct {
	DSN  string `envconfig:"DSN"`
	Salt string `envconfig:"SALT"`
}
