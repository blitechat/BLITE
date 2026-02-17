# BLITE v1.0.4 Deployment Guide

## Quick Start

### Prerequisites
- Node.js 20+ (mediasoup requires Node 22+, but works with 20)
- Ubuntu/Debian Linux (recommended)
- Public IP address for voice/video
- Open ports: 3001 (HTTP), 40000-49999 (RTC)

---

## Step-by-Step Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools for native dependencies
sudo apt install -y build-essential python3 git
```

### 2. Clone and Install

```bash
# Clone repository
git clone <your-repo-url> /opt/blite
cd /opt/blite

# Install dependencies
npm install
cd server && npm install && cd ..
```

### 3. Configure Environment

```bash
# Create production .env file
cd server
nano .env
```

**Minimum Required Configuration:**
```bash
# CRITICAL: Generate a strong secret!
JWT_SECRET=<use: openssl rand -base64 64>

# Your server's public IP or domain
MEDIASOUP_ANNOUNCED_IP=your.server.ip.here

# Auto-scale workers (recommended)
MEDIASOUP_NUM_WORKERS=auto

# Port range for voice/video (ensure these are open in firewall)
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=49999

# CORS origins (add your domain)
CORS_ORIGIN=https://yourdomain.com,https://blite.chat

# Server port
PORT=3001
```

### 4. Generate Strong JWT Secret

```bash
# Generate a cryptographically secure secret
openssl rand -base64 64

# Copy output and paste into .env as JWT_SECRET value
```

### 5. Configure Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow WebSocket
sudo ufw allow 3001/tcp

# Allow RTC ports (UDP + TCP for mediasoup)
sudo ufw allow 40000:49999/udp
sudo ufw allow 40000:49999/tcp

# Enable firewall
sudo ufw enable
```

### 6. Build Application

```bash
# Build web and electron apps
npm run build:web
npm run build:electron:prod

# Copy web build to server
cp -r dist-web/* server/public/
```

### 7. Set Up Reverse Proxy (Nginx)

```bash
# Install nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/blite
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates (add after running certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Node.js server
    location / {
        proxy_pass http://localhost:3001;
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
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Increase upload size limit
    client_max_body_size 25M;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/blite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com
```

### 8. Set Up Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/blite.service
```

**Service Configuration:**
```ini
[Unit]
Description=BLITE Chat Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/blite/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --loader tsx src/index.ts
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/blite/server/data /opt/blite/server/uploads

# Logging
StandardOutput=append:/var/log/blite/blite.log
StandardError=append:/var/log/blite/blite-error.log

[Install]
WantedBy=multi-user.target
```

```bash
# Create log directory
sudo mkdir -p /var/log/blite
sudo chown ubuntu:ubuntu /var/log/blite

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable blite
sudo systemctl start blite

# Check status
sudo systemctl status blite
```

### 9. Set Up Database Backups

```bash
# Create backup script
sudo nano /opt/blite/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/blite/backups"
DB_PATH="/opt/blite/server/data/blite.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/blite_$DATE.db'"

# Keep only last 30 days
find "$BACKUP_DIR" -name "blite_*.db" -mtime +30 -delete

echo "Backup completed: blite_$DATE.db"
```

```bash
# Make executable
sudo chmod +x /opt/blite/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/blite/backup.sh
```

### 10. Set Up Log Rotation

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/blite
```

```
/var/log/blite/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        systemctl reload blite > /dev/null 2>&1 || true
    endscript
}
```

---

## Verification

### Check Service Status
```bash
sudo systemctl status blite
sudo journalctl -u blite -f
```

### Check Health Endpoint
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-13T...",
  "uptime": 123.456,
  "memory": { ... }
}
```

### Check Metrics
```bash
curl http://localhost:3001/api/metrics
```

### Test Voice/Video
1. Open https://yourdomain.com
2. Create account and join a server
3. Join a voice channel
4. Check if you can hear/speak

---

## Troubleshooting

### Voice/Video Not Working

**Check mediasoup announced IP:**
```bash
# Should show your public IP
grep MEDIASOUP_ANNOUNCED_IP /opt/blite/server/.env

# Verify with:
curl ifconfig.me
```

**Check RTC ports are open:**
```bash
sudo ufw status | grep 40000:49999
```

### Database Issues

**Check database file:**
```bash
ls -lh /opt/blite/server/data/blite.db*
```

**Verify WAL mode:**
```bash
sqlite3 /opt/blite/server/data/blite.db "PRAGMA journal_mode;"
# Should return: wal
```

### High Memory Usage

**Check worker count:**
```bash
grep MEDIASOUP_NUM_WORKERS /opt/blite/server/.env
```

**Adjust if needed:**
```bash
# Reduce to 2 workers
MEDIASOUP_NUM_WORKERS=2
```

### Rate Limiting Too Strict

Edit `/opt/blite/server/src/middleware/rateLimiter.ts`:
- Increase `max` values
- Increase `windowMs` durations

---

## Monitoring

### Check Logs
```bash
# Real-time logs
sudo journalctl -u blite -f

# Recent errors
sudo tail -50 /var/log/blite/blite-error.log

# Full log
sudo less /var/log/blite/blite.log
```

### Monitor Resources
```bash
# Memory usage
free -h

# Disk usage
df -h

# CPU usage
top
```

### Monitor Mediasoup
Check logs for:
```
[mediasoup] Worker <pid> created
[mediasoup] Workers initialized
[mediasoup] Room created for channel <id>
```

---

## Updates

### Pull Latest Changes
```bash
cd /opt/blite
git pull origin master

# Install new dependencies
npm install
cd server && npm install && cd ..

# Rebuild
npm run build:web
npm run build:electron:prod
cp -r dist-web/* server/public/

# Restart service
sudo systemctl restart blite
```

### Database Migrations
Currently handled automatically via `server/src/db/connection.ts`

---

## Security Checklist

- [ ] JWT_SECRET is a strong random string (64+ characters)
- [ ] HTTPS/TLS is enabled with valid certificate
- [ ] Firewall is configured (UFW/iptables)
- [ ] SSH key-based authentication is enabled
- [ ] Root login is disabled
- [ ] Automatic security updates are enabled
- [ ] Database backups are running daily
- [ ] Log rotation is configured
- [ ] Monitoring/alerting is set up

---

## Performance Tuning

### For High Traffic (100+ concurrent users)

**Increase worker count:**
```bash
MEDIASOUP_NUM_WORKERS=8
```

**Increase database cache:**
Edit `server/src/db/connection.ts`:
```typescript
sqlite.pragma('cache_size = -128000'); // 128MB
```

**Add Redis for session storage** (future enhancement)

**Use CDN for static assets** (future enhancement)

---

## Emergency Procedures

### Service Won't Start
```bash
# Check logs
sudo journalctl -u blite -n 100 --no-pager

# Check port conflicts
sudo lsof -i :3001

# Verify configuration
cd /opt/blite/server
node --loader tsx src/index.ts
```

### Out of Disk Space
```bash
# Check disk usage
df -h

# Clean old logs
sudo journalctl --vacuum-time=7d

# Clean old backups
find /opt/blite/backups -mtime +30 -delete

# Clean build artifacts
cd /opt/blite
rm -rf node_modules dist-web out
npm install
npm run build:web
```

### Database Corruption
```bash
# Stop service
sudo systemctl stop blite

# Restore from backup
cd /opt/blite/server/data
mv blite.db blite.db.corrupt
cp /opt/blite/backups/blite_YYYYMMDD.db blite.db

# Start service
sudo systemctl start blite
```

---

## Support

For issues:
1. Check logs first
2. Review health endpoint: `/api/health`
3. Check metrics endpoint: `/api/metrics`
4. Review this deployment guide
5. Check INFRASTRUCTURE_ANALYSIS.md

**Version:** 1.0.4
**Last Updated:** 2026-02-13
