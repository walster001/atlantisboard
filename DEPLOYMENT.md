# Deployment Guide

This guide covers deployment strategies for the Kanboard application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Deployment](#docker-deployment)
3. [Manual Deployment](#manual-deployment)
4. [Production Configuration](#production-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+, Debian 11+, or similar)
- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB+ recommended
- **Storage**: 20GB+ free disk space
- **Network**: Ports 3000 (HTTP), 27017 (MongoDB), 6379 (Redis), 9000 (MinIO)

### Required Software

- Docker 20.10+ and Docker Compose 2.0+
- OR Bun 1.3.5+ with MongoDB, Redis, and MinIO installed

## Docker Deployment

### Step 1: Prepare Environment

```bash
# Clone repository
git clone <repository-url>
cd atlboard-new

# Create production environment file
cp .env.example .env.production
```

### Step 2: Configure Environment Variables

Edit `.env.production` with production values:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://mongo:27017/kanboard

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-minio-access-key
MINIO_SECRET_KEY=your-minio-secret-key
MINIO_USE_SSL=false

# Security - CHANGE THESE
JWT_SECRET=generate-strong-random-secret
SESSION_SECRET=generate-strong-random-secret
ENCRYPTION_KEY=generate-strong-random-key

# CORS - Set to your domain
CORS_ORIGIN=https://yourdomain.com
```

### Step 3: Build and Start

```bash
# Build images
docker-compose -f docker-compose.yml build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Step 4: Verify Deployment

```bash
# Check health
curl http://localhost:3000/health

# Check all containers are running
docker-compose ps
```

## Manual Deployment

### Step 1: Install Dependencies

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install project dependencies
bun install
```

### Step 2: Set Up Services

#### MongoDB

```bash
# Install MongoDB (Ubuntu/Debian)
wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### Redis

```bash
# Install Redis (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Set: requirepass your-secure-password

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### MinIO

```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

# Create MinIO user and directories
sudo useradd -r -s /bin/false minio
sudo mkdir -p /var/minio/data
sudo chown minio:minio /var/minio/data

# Create systemd service
sudo nano /etc/systemd/system/minio.service
```

MinIO service file:
```ini
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
Type=simple
User=minio
ExecStart=/usr/local/bin/minio server /var/minio/data --console-address ":9001"
Restart=always
Environment="MINIO_ROOT_USER=your-access-key"
Environment="MINIO_ROOT_PASSWORD=your-secret-key"

[Install]
WantedBy=multi-user.target
```

```bash
# Start MinIO
sudo systemctl start minio
sudo systemctl enable minio
```

### Step 3: Configure Application

```bash
# Set environment variables
cp .env.example .env
nano .env  # Edit with production values
```

### Step 4: Build and Start

```bash
# Build for production
bun run build

# Start with process manager (PM2)
npm install -g pm2
pm2 start bun --name kanboard -- run start
pm2 save
pm2 startup
```

## Production Configuration

### Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/kanboard`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/kanboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Security Hardening

### 1. Firewall Configuration

```bash
# UFW setup
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. MongoDB Security

```javascript
// Connect to MongoDB and create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "strong-password",
  roles: ["userAdminAnyDatabase", "dbAdminAnyDatabase"]
})

// Enable authentication in /etc/mongod.conf
security:
  authorization: enabled
```

### 3. Redis Security

- Use strong password in `requirepass`
- Bind to localhost: `bind 127.0.0.1`
- Disable dangerous commands

### 4. MinIO Security

- Use strong access keys
- Enable HTTPS for production
- Configure bucket policies
- Regular access key rotation

### 5. Application Security

- Change all default secrets
- Enable rate limiting
- Configure CORS properly
- Regular dependency updates: `bun audit`
- Monitor logs for suspicious activity

## Monitoring and Maintenance

### Log Monitoring

```bash
# Docker logs
docker-compose logs -f app

# PM2 logs
pm2 logs kanboard

# System logs
journalctl -u kanboard -f
```

### Backup Strategy

#### MongoDB Backup

```bash
# Create backup script
cat > /usr/local/bin/backup-mongodb.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
mongodump --out $BACKUP_DIR/$DATE
tar -czf $BACKUP_DIR/$DATE.tar.gz $BACKUP_DIR/$DATE
rm -rf $BACKUP_DIR/$DATE
# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-mongodb.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /usr/local/bin/backup-mongodb.sh
```

#### MinIO Backup

MinIO has built-in replication. Configure bucket replication for redundancy.

### Health Checks

Monitor the `/health` endpoint:

```bash
# Simple health check script
curl -f http://localhost:3000/health || echo "Health check failed"
```

### Updates

```bash
# Update dependencies
bun update

# Check for security vulnerabilities
bun audit

# Rebuild and restart
bun run build
pm2 restart kanboard  # or docker-compose restart
```

## Troubleshooting

### Application won't start

1. Check logs: `docker-compose logs app` or `pm2 logs kanboard`
2. Verify environment variables are set correctly
3. Check MongoDB, Redis, and MinIO are accessible
4. Verify ports are not in use: `netstat -tulpn | grep :3000`

### Database connection issues

1. Verify MongoDB is running: `sudo systemctl status mongod`
2. Check connection string in `.env`
3. Test connection: `mongosh "mongodb://localhost:27017/kanboard"`

### Performance issues

1. Check resource usage: `htop` or `docker stats`
2. Review MongoDB indexes
3. Check Redis cache hit rates
4. Monitor network traffic
5. Review application logs for slow queries

## Support

For deployment issues, check:
- Application logs
- System logs
- Service status (MongoDB, Redis, MinIO)
- Network connectivity
- Firewall rules

For additional support, open an issue on the GitHub repository.

