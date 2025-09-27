package config

type Config struct {
	Logger   Logger    `envconfig:"LOGGER"`
	Database *Database `envconfig:"DATABASE"`
	Auth     *Auth     `envconfig:"AUTH"`
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
