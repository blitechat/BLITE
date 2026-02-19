# Self-Hosting BLITE

BLITE is private by default — all message content is end-to-end encrypted, even on the hosted service. Self-hosting gives you control over metadata too.

## Quick Start (Lite Mode — Text Only)

3 commands, no port forwarding required:

```bash
git clone https://github.com/blitechat/BLITE && cd BLITE
bash setup.sh
# Pick "lite" mode when asked — done.
```

This gives you: text chat, E2EE, file sharing, communities, DMs.

## Full Setup (With Voice & Video)

```bash
git clone https://github.com/blitechat/BLITE && cd BLITE
bash setup.sh
# Pick "full" mode when asked
```

You'll also need to open UDP ports **40000–49999** on your firewall/cloud provider for WebRTC media transport.

### Firewall Examples

```bash
# UFW (Ubuntu)
sudo ufw allow 40000:49999/udp

# iptables
sudo iptables -A INPUT -p udp --dport 40000:49999 -j ACCEPT

# AWS Security Group — add inbound rule:
#   Type: Custom UDP, Port range: 40000-49999, Source: 0.0.0.0/0
```

## Custom Domain with HTTPS

### Option A: Included Caddy (easiest, no existing proxy)

If you have a domain name pointing to your server, the setup script will configure it automatically. To enable the Caddy reverse proxy for auto-HTTPS:

1. Run `bash setup.sh` and enter your domain when prompted
2. Edit `docker-compose.yml` and uncomment the `caddy` service and its volumes
3. Run `docker compose up -d`

Caddy auto-provisions Let's Encrypt certificates — no certbot or nginx needed.

### Option B: Your Existing Reverse Proxy (nginx, Traefik, Caddy, etc.)

If you already have a reverse proxy running, skip the bundled Caddy entirely and just proxy to port 3001.

BLITE uses WebSockets (Socket.IO), so make sure your proxy config supports connection upgrades.

**nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;

    # Your existing SSL config here

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik (Docker labels) example:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.blite.rule=Host(`your.domain.com`)"
  - "traefik.http.routers.blite.entrypoints=websecure"
  - "traefik.http.routers.blite.tls.certresolver=letsencrypt"
  - "traefik.http.services.blite.loadbalancer.server.port=3001"
```

**Note:** Voice and video (full mode) use WebRTC for media transport, which goes directly over UDP — not through your reverse proxy. You still need UDP ports 40000–49999 open at the firewall level regardless of which proxy you use.

## Requirements

- A Linux server (any cloud provider works — AWS, DigitalOcean, Hetzner, etc.)
- Docker and Docker Compose
- 512 MB RAM minimum (1 GB recommended for full mode)
- Ports: 3001 (or 80/443 with Caddy), plus 40000-49999/udp for full mode

## Configuration

All settings live in the `.env` file created by `setup.sh`. Key options:

| Variable | Default | Description |
|----------|---------|-------------|
| `BLITE_MODE` | `lite` | `full` for voice/video, `lite` for text only |
| `SERVER_URL` | auto-detected | Public URL of your instance |
| `JWT_SECRET` | auto-generated | Auth token signing key |
| `MEDIASOUP_ANNOUNCED_IP` | auto-detected | Public IP for WebRTC |
| `MEDIASOUP_RTC_MIN_PORT` | `40000` | Start of UDP port range |
| `MEDIASOUP_RTC_MAX_PORT` | `49999` | End of UDP port range |

## Data

All data is stored in a Docker volume (`blite-data`):
- **Database:** SQLite at `/data/blite.db`
- **Uploads:** Files at `/data/uploads/`

Data persists across container restarts and updates.

### Backups

```bash
# Create a backup
docker compose exec blite cp /data/blite.db /data/blite.db.backup

# Or copy to host
docker cp blite:/data/blite.db ./blite-backup.db
```

## Updating

```bash
git pull
docker compose up -d --build
```

## Troubleshooting

**Voice/video not working in full mode?**
- Check that UDP ports 40000-49999 are open
- Verify `MEDIASOUP_ANNOUNCED_IP` in `.env` matches your public IP
- Check logs: `docker compose logs blite`

**Can't connect from other devices?**
- Make sure `SERVER_URL` and `CORS_ORIGIN` in `.env` are correct
- If using IP access, ensure port 3001 is open

**Container won't start?**
- Check logs: `docker compose logs blite`
- Verify Docker is running: `docker info`
