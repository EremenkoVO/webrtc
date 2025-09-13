# WebRTC Signaling Server (Python)

A Python 3 rewrite of the Node.js WebRTC signaling server using FastAPI and WebSockets.

## Features

- **FastAPI**: Modern, fast web framework for building APIs
- **WebSocket Support**: Real-time communication for WebRTC signaling
- **JWT Authentication**: Secure token-based authentication
- **SQLite Database**: Lightweight database for users, channels, and messages
- **HTTPS Support**: SSL/TLS encryption support
- **CORS Configuration**: Cross-origin resource sharing support

## Installation

1. Install Python 3.8+ and pip
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your configuration

## Running the Server

### Development
```bash
python main.py
```

### Production with SSL
Make sure you have SSL certificates in the `cert/` directory:
- `cert/key.pem` - Private key
- `cert/cert.pem` - Certificate

Then run:
```bash
python main.py
```

### Production with uvicorn
```bash
uvicorn main:app --host 0.0.0.0 --port 3000 --ssl-keyfile cert/key.pem --ssl-certfile cert/cert.pem
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

### Channels
- `GET /api/channels` - Get all channels
- `POST /api/channels` - Create new channel

### Messages
- `GET /api/messages/channel/{channel_id}` - Get messages for channel
- `POST /api/messages` - Create new message

### WebSocket
- `WS /ws?token=<jwt_token>` - WebSocket connection for real-time communication

## WebSocket Message Types

### Client to Server
- `webrtc_offer` - WebRTC offer for peer connection
- `webrtc_answer` - WebRTC answer for peer connection
- `webrtc_ice_candidate` - ICE candidate for peer connection
- `chat_message` - Chat message to broadcast

### Server to Client
- `user_list` - List of connected users
- `user_joined` - New user connected
- `user_left` - User disconnected
- `webrtc_offer` - WebRTC offer from peer
- `webrtc_answer` - WebRTC answer from peer
- `webrtc_ice_candidate` - ICE candidate from peer
- `chat_message` - Broadcasted chat message

## Database Schema

### Users
- `id` - Primary key
- `username` - Unique username
- `password` - Hashed password

### Channels
- `id` - Primary key
- `name` - Unique channel name
- `created_by` - User ID who created the channel
- `created_at` - Timestamp

### Messages
- `id` - Primary key
- `channel_id` - Channel ID
- `user_id` - User ID who sent the message
- `content` - Message content
- `created_at` - Timestamp

## Migration from Node.js

This Python server is functionally equivalent to the original Node.js server and provides the same API endpoints and WebSocket functionality. The main differences:

1. **Framework**: FastAPI instead of Express.js
2. **WebSockets**: Built-in WebSocket support instead of `ws` library
3. **Authentication**: `python-jose` instead of `jsonwebtoken`
4. **Password Hashing**: `passlib` instead of `bcrypt`
5. **Database**: `aiosqlite` instead of `sqlite3` with async support

## Development

The server structure follows FastAPI best practices:
- `main.py` - Application entry point and WebSocket handling
- `config.py` - Configuration management
- `auth.py` - Authentication utilities
- `database.py` - Database operations
- `websocket_manager.py` - WebSocket connection management
- `routes/` - API route handlers