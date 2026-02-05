# Chat Server

Node.js WebSocket server for real-time chat functionality in the WebRTC platform.

## Features

- Real-time text messaging via WebSocket
- Room-based chat (integrated with existing room system)
- JWT authentication
- Message history (last 50 messages per room)
- Typing indicators
- User join/leave notifications

## Architecture

- **Port**: 3001 (configurable via `PORT` environment variable)
- **WebSocket Endpoint**: `/ws`
- **Health Check**: `/health`

## Environment Variables

- `PORT`: Server port (default: 3001)
- `MYDISCORD_AUTH_TOKEN_SECRET`: JWT secret key (must match Go backend)
- `BACKEND_API_URL`: Backend API URL (default: http://backend:8080)

## Message Types

### Client → Server

#### Join Room
```json
{
  "type": "join",
  "room": "room-id"
}
```

#### Send Chat Message
```json
{
  "type": "chat_message",
  "text": "Hello, world!"
}
```

#### Typing Indicator
```json
{
  "type": "typing",
  "isTyping": true
}
```

### Server → Client

#### Joined Confirmation
```json
{
  "type": "joined",
  "room": "room-id",
  "clientId": "client-123",
  "username": "user1",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Chat History
```json
{
  "type": "chat_history",
  "room": "room-id",
  "messages": [
    {
      "type": "chat_message",
      "room": "room-id",
      "from": "client-123",
      "username": "user1",
      "text": "Hello!",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Chat Message
```json
{
  "type": "chat_message",
  "room": "room-id",
  "from": "client-123",
  "username": "user1",
  "text": "Hello, world!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### User Joined
```json
{
  "type": "user_joined",
  "room": "room-id",
  "clientId": "client-456",
  "username": "user2",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### User Left
```json
{
  "type": "user_left",
  "room": "room-id",
  "clientId": "client-456",
  "username": "user2",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Typing Indicator
```json
{
  "type": "typing",
  "room": "room-id",
  "from": "client-123",
  "username": "user1",
  "isTyping": true
}
```

## Connection

Connect via WebSocket with authentication:

```
wss://your-domain.com/api/v1/chat/ws?token=<jwt-token>&room=<room-id>
```

## Development

```bash
cd chatserver
npm install
npm run dev
```

## Docker

```bash
docker build -t webrtc-chat-server ./chatserver
docker run -p 3001:3001 \
  -e MYDISCORD_AUTH_TOKEN_SECRET=your-secret \
  webrtc-chat-server
```
