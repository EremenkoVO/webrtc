import 'dotenv/config';

export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  jwt: {
    secret: process.env.SECRET_KEY || 'your-secret-key-here',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  cors: {
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : [
          'https://192.168.1.129:5173',
          'https://176.108.246.7',
          'http://176.108.246.7',
          'https://localhost:5173',
          'http://localhost:5173',
          'http://localhost:80',
          'https://localhost:80',
          'http://127.0.0.1:5173',
          'https://127.0.0.1:5173',
        ],
  },
  database: {
    filename: process.env.DB_FILENAME || 'database.db',
  },
};
