# Localhost Development Setup

This guide explains how to run the WebRTC platform on localhost for development.

## Quick Start

### 1. Generate SSL Certificates

```bash
./generate-ssl-localhost.sh
```

This creates self-signed certificates in `./ssl_certs/` for localhost.

### 2. Start Services

```bash
docker-compose -f docker-compose.localhost.yml up --build
```

### 3. Access the Application

- **Frontend (via Nginx)**: https://localhost:5001 (recommended)
- **Frontend (direct)**: http://localhost:5173 (API requests are proxied to backend)
- **Backend API (direct)**: http://localhost:8080
- **Backend API (via Nginx)**: https://localhost:5001/api/v1
- **Chat Server (direct)**: http://localhost:3001

**Note**: When accessing the frontend directly on port 5173, API requests are automatically proxied to the backend. However, for WebSockets, it's recommended to use the main Nginx proxy (port 5001).

## Port Mappings

| Service | Port | Description |
|---------|------|-------------|
| Nginx HTTPS | 5001 | Main entry point (HTTPS) |
| Nginx HTTP | 5002 | Redirects to HTTPS |
| Backend API | 8080 | Direct access for debugging |
| Backend Health | 8081 | Health check endpoint |
| Chat Server | 3001 | Direct access for debugging |
| Frontend | 5173 | Direct access (bypasses Nginx) |

## Features

- **Direct Port Access**: All services are exposed directly for easier debugging
- **SSL Certificates**: Self-signed certificates for localhost (browser will show warning)
- **Hot Reload**: Services restart automatically on code changes
- **Network Isolation**: Uses `localhost` network for development

## SSL Certificate Warning

When accessing https://localhost:5001, your browser will show a security warning because we're using self-signed certificates. This is normal for local development:

1. Click "Advanced" or "Show Details"
2. Click "Proceed to localhost" or "Accept the Risk and Continue"

## Environment Variables

You can override defaults using environment variables:

```bash
export MYDISCORD_AUTH_TOKEN_SECRET=your-secret-key
export MYDISCORD_DATABASE_SALT=your-salt

docker-compose -f docker-compose.localhost.yml up
```

## WebSocket Configuration

WebSockets are configured to work with HTTPS (WSS). The client automatically detects the protocol:
- If accessing via `https://localhost:5001`, WebSockets will use `wss://`
- If accessing via `http://localhost:5002`, WebSockets will use `ws://`

Both signaling (WebRTC) and chat WebSockets are proxied through Nginx.

## Troubleshooting

### WebSocket Connection Issues

If WebSockets don't connect:

1. **Check browser console** for WebSocket errors
2. **Verify SSL certificates** are generated:
   ```bash
   ls -la ssl_certs/
   ```
3. **Check Nginx logs**:
   ```bash
   docker-compose -f docker-compose.localhost.yml logs nginx
   ```
4. **Verify WebSocket endpoints**:
   - Signaling: `wss://localhost:5001/api/v1/ws`
   - Chat: `wss://localhost:5001/api/v1/chat/ws`
5. **Test direct connection** (bypass Nginx):
   - Backend: `ws://localhost:8080/api/v1/ws`
   - Chat: `ws://localhost:3001/ws`

### Port Already in Use

If you get a "port already in use" error:

```bash
# Check what's using the port
lsof -i :5001  # or :5002, :8080, :3001, :5173

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or change the port in docker-compose.localhost.yml
```

**Note**: Port 5000 is typically used by macOS ControlCenter. The HTTP port has been changed to 5002 to avoid conflicts.

### SSL Certificate Issues

If SSL certificates are missing or invalid:

```bash
# Regenerate certificates
./generate-ssl-localhost.sh

# Restart nginx
docker-compose -f docker-compose.localhost.yml restart nginx
```

### Services Not Starting

Check logs:

```bash
# All services
docker-compose -f docker-compose.localhost.yml logs

# Specific service
docker-compose -f docker-compose.localhost.yml logs backend
docker-compose -f docker-compose.localhost.yml logs chatserver
docker-compose -f docker-compose.localhost.yml logs frontend
docker-compose -f docker-compose.localhost.yml logs nginx
```

### Database Issues

Reset the database:

```bash
# Stop services
docker-compose -f docker-compose.localhost.yml down

# Remove volume
docker volume rm webrtc_backend_data

# Start again
docker-compose -f docker-compose.localhost.yml up --build
```

## Development Workflow

1. **Start services**: `docker-compose -f docker-compose.localhost.yml up`
2. **View logs**: `docker-compose -f docker-compose.localhost.yml logs -f`
3. **Stop services**: `docker-compose -f docker-compose.localhost.yml down`
4. **Rebuild**: `docker-compose -f docker-compose.localhost.yml up --build`

## Differences from Production

- Direct port access for all services
- Self-signed SSL certificates
- More relaxed rate limiting
- Development-friendly logging
- No restart policies (can be stopped easily)
