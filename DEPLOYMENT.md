# Cloud VM Deployment Guide

This guide covers deploying the WebRTC application on a cloud virtual machine.

## Architecture

- **Backend**: Go server (port 8080) - handles API requests and WebSocket connections
- **Frontend**: Vue.js app served by Nginx (port 80)
- **Reverse Proxy**: Nginx handling HTTPS termination and routing
- **Network**: Bridge network for internal service communication

## Prerequisites

1. Cloud VM with Ubuntu 20.04+ or similar Linux distribution
2. Domain name pointing to your VM's IP address
3. Ports 80 and 443 open in firewall/security groups
4. Docker and Docker Compose installed
5. SSH access to the VM
6. Minimum 2GB RAM, 2 CPU cores recommended

## Initial Setup

### 1. Install Docker and Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes to take effect
# Verify installation
docker --version
docker-compose --version
```

### 2. Clone Repository

```bash
git clone <your-repository-url>
cd webrtc
```

### 3. Configure Domain Name

Edit `nginx.conf` and replace `your-domain.com` with your actual domain:

```bash
sed -i 's/your-domain.com/youractual.domain.com/g' nginx.conf
```

### 4. Set Environment Variables

Create a `.env` file in the project root:

```bash
cat > .env << EOF
MYDISCORD_DATABASE_SALT=$(openssl rand -hex 32)
MYDISCORD_AUTH_TOKEN_SECRET=$(openssl rand -hex 32)
EOF
```

**Note:** These environment variables configure:
- `MYDISCORD_PORT`: Backend server port (set to 8080)
- `MYDISCORD_DATABASE_DSN`: Database file location (persisted in Docker volume)
- `MYDISCORD_DATABASE_SALT`: Salt for password hashing
- `MYDISCORD_AUTH_TOKEN_SECRET`: Secret key for JWT token generation

## SSL Certificate Setup

An automated script `generate-ssl.sh` is provided to simplify SSL certificate generation.

### Quick Start (Recommended)

**For Development/Testing (Self-Signed):**
```bash
./generate-ssl.sh --type self-signed --domain yourdomain.com
```

**For Production (Let's Encrypt):**
```bash
# Start nginx first
docker-compose -f docker-compose.prod.yml up -d nginx

# Generate certificate
./generate-ssl.sh --type letsencrypt --domain yourdomain.com --email your-email@example.com
```

### Manual Setup

If you prefer manual setup:

#### Option A: Self-Signed Certificates (Development/Testing)

```bash
# Create certificate directory
mkdir -p ssl_certs

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl_certs/key.pem \
  -out ssl_certs/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=your-domain.com"

# Set permissions
chmod 600 ssl_certs/key.pem
chmod 644 ssl_certs/cert.pem
```

#### Option B: Let's Encrypt (Production - Recommended)

```bash
# 1. Start nginx
docker-compose -f docker-compose.prod.yml up -d nginx

# 2. Generate certificate using certbot
docker run --rm \
  --network webrtc_prod \
  -v $(pwd)/ssl_certs:/etc/letsencrypt \
  -v $(pwd)/certbot_data:/var/www/certbot \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com \
  -d www.your-domain.com

# 3. Create symbolic links for nginx
ln -sf $(pwd)/ssl_certs/live/your-domain.com/fullchain.pem ssl_certs/cert.pem
ln -sf $(pwd)/ssl_certs/live/your-domain.com/privkey.pem ssl_certs/key.pem

# 4. Restart nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

**Automatic Renewal:**

Uncomment the certbot service in `docker-compose.prod.yml` to enable automatic certificate renewal every 12 hours.

## Deployment

### 1. Build and Start Services

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 2. Verify Deployment

```bash
# Check if all containers are running
docker ps

# Test backend health endpoint directly
curl http://localhost:8080/health

# Test through nginx (replace with your domain)
curl https://your-domain.com/api/health

# Check WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" https://your-domain.com/ws
```

## Firewall Configuration

### UFW (Ubuntu)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

### Cloud Provider Security Groups

Ensure your cloud provider's security group/firewall allows:
- Port 22 (SSH) from your IP
- Port 80 (HTTP) from anywhere (0.0.0.0/0)
- Port 443 (HTTPS) from anywhere (0.0.0.0/0)

## Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart services
docker-compose -f docker-compose.prod.yml up -d --build

# Remove old images
docker image prune -f
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

### Backup Database

```bash
# Backup
docker run --rm -v webrtc_backend_data:/data -v $(pwd):/backup ubuntu \
  tar czf /backup/database-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Restore (if needed)
docker run --rm -v webrtc_backend_data:/data -v $(pwd):/backup ubuntu \
  tar xzf /backup/database-backup-YYYYMMDD-HHMMSS.tar.gz -C /
```

### Stop Services

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes (WARNING: deletes data)
docker-compose -f docker-compose.prod.yml down -v
```

## Monitoring

### Check Container Health

```bash
# Container stats
docker stats

# Container resource usage
docker-compose -f docker-compose.prod.yml top
```

### Check Disk Space

```bash
# Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a --volumes
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker-compose -f docker-compose.prod.yml logs backend

# Check container status
docker inspect webrtc_backend
```

### SSL Certificate Issues

```bash
# Verify certificate files exist
ls -la ssl_certs/

# Check certificate validity
openssl x509 -in ssl_certs/cert.pem -text -noout

# Test SSL connection
openssl s_client -connect your-domain.com:443
```

### Port Already in Use

```bash
# Find what's using port 80 or 443
sudo lsof -i :80
sudo lsof -i :443

# Stop conflicting service
sudo systemctl stop apache2  # or nginx if running outside Docker
```

### Database Connection Issues

```bash
# Check if backend can access database
docker-compose -f docker-compose.prod.yml exec backend ls -la /app/data/

# Check volume
docker volume inspect webrtc_backend_data
```

## Performance Tuning

### Nginx Worker Processes

Add to nginx.conf (outside server blocks):

```nginx
worker_processes auto;
worker_connections 1024;
```

### Docker Resource Limits

Add to services in docker-compose.prod.yml:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      memory: 256M
```

## Security Checklist

- [ ] Domain name configured correctly
- [ ] Valid SSL certificates installed
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] Strong SECRET_KEY set in .env
- [ ] SSH key authentication enabled (password auth disabled)
- [ ] Regular backups configured
- [ ] Monitoring/logging set up
- [ ] OS and packages up to date
- [ ] Docker containers restart on failure
- [ ] Rate limiting enabled in nginx

## Common Issues

### Health Check Failing

If the backend health check fails, ensure your Go server has a `/health` endpoint:

```bash
# Check if backend is responding
docker-compose -f docker-compose.prod.yml exec backend wget -O- http://localhost:8080/health

# If no health endpoint exists, remove healthcheck from docker-compose.prod.yml
```

### Rate Limiting Errors

If you see nginx errors about `limit_req_zone`, ensure the zones are defined before any server blocks in nginx.conf (already configured in the provided file).

### Container Cannot Start

```bash
# Check build logs
docker-compose -f docker-compose.prod.yml build --no-cache

# Check if Go modules are properly configured
ls -la goserver/go.mod

# Check if Vue build succeeds
cd vueclient && npm run build
```

## Support

For issues or questions:
- Check logs: `docker-compose -f docker-compose.prod.yml logs -f`
- Review nginx error logs: `docker-compose -f docker-compose.prod.yml exec nginx cat /var/log/nginx/error.log`
- Check backend health: `curl http://localhost:8080/health`
- View container details: `docker inspect webrtc_backend`
