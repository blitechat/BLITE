# BLITE Voice/Video Configuration

## Overview
Voice and video chat uses Mediasoup SFU with WebRTC for real-time media streaming. All voice and video frames are end-to-end encrypted with AES-128-GCM using the WebRTC Insertable Streams API.

## End-to-End Encryption

### How Voice/Video E2EE Works
1. Each participant generates a fresh **ephemeral Curve25519 DH key pair** per voice session (independent of identity keys)
2. Ephemeral public keys are exchanged via the signaling server
3. Each participant generates a random **AES-128-GCM session key** and encrypts it for each peer using `nacl.box` (X25519 DH)
4. Encoded media frames are encrypted using the **Insertable Streams API** between the encoder and the RTP packetizer — the SFU only sees ciphertext

### Frame Format
```
[header (1 byte)][AES-GCM ciphertext + 16-byte tag][IV (12 bytes)][keyId (1 byte)]
```
- The first byte is left unencrypted for SFU keyframe detection
- Random 12-byte IV per frame
- keyId tracks key rotations (grace period for in-flight frames)

### Key Rotation
- Keys are rotated when a participant leaves (forward secrecy)
- A 2-second grace period allows in-flight frames encrypted with the old key to be decrypted
- Old key material is securely zeroed after rotation

### Browser Support
Voice E2EE requires the Insertable Streams API (Chromium-based browsers: Chrome, Edge, Brave, Electron). On unsupported browsers, voice/video works without E2EE.

## Server Configuration

### Environment Variables (server/.env)
```
PORT=3001
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=YOUR_SERVER_IP
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=40100
MEDIASOUP_NUM_WORKERS=1
CORS_ORIGIN=http://blite.chat,https://blite.chat
```

### Network Ports Required

#### For Signaling (HTTP/WebSocket):
- **TCP 80** - HTTP/WebSocket through Nginx reverse proxy
- **TCP 3001** - Node.js server (internal, proxied by Nginx)

#### For Media (WebRTC):
- **UDP 40000-40100** - Mediasoup RTC media transport

## Firewall Configuration

### Local Firewall (iptables) ```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 40000:40100 -j ACCEPT
```

### Oracle Cloud Network Security Group
**Must have these ingress rules:**

1. **HTTP Signaling**
   - Source: 0.0.0.0/0
   - Protocol: TCP
   - Port: 80

2. **WebSocket/API (if not using Nginx)**
   - Source: 0.0.0.0/0
   - Protocol: TCP
   - Port: 3001

3. **WebRTC Media**
   - Source: 0.0.0.0/0
   - Protocol: UDP
   - Port Range: 40000-40100

## How It Works

### 1. Signaling Path
```
Client Browser
    ↓ HTTP/WebSocket
Cloudflare Proxy (if enabled)
    ↓ TCP 80
Nginx (YOUR_SERVER_IP:80)
    ↓ Reverse Proxy
Node.js Server (localhost:3001)
```

### 2. Media Path (WebRTC)
```
Client Browser
    ↓ UDP (Direct P2P)
Oracle Cloud Server (YOUR_SERVER_IP:40000-40100)
    ↓
Mediasoup SFU Worker
```

**Important:** WebRTC media does NOT go through Cloudflare proxy. It connects directly to the announced IP (YOUR_SERVER_IP) using UDP ports.

## Client Configuration

### ICE Servers (src/renderer/services/voiceService.ts)
```javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
```

### Optional TURN Servers
Set these environment variables in .env for NAT traversal:
```
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_CREDENTIAL=your-turn-credential
```

## Testing Voice/Video

### 1. Test Signaling Connection
Open browser console and check for:
```
[Voice] Joining channel: <channelId>
[Voice] Joined successfully, peers: <count>
[Voice] Device loaded
```

### 2. Test Transport Creation
Look for:
```
[Voice] Creating send transport...
[Voice] Send transport created: <transportId>
[Voice] Send transport connecting...
[Voice] Send transport connected
```

### 3. Test Media Production
Look for:
```
[Voice] Producing: audio source: mic
[Voice] Producer created: <producerId>
```

### 4. Check Server Logs
```bash
tail -f /tmp/claude-1001/-home-ubuntu-BLITE/tasks/b8c6484.output
```

Look for:
```
[Voice] User <userId> (<name>) joining channel <channelId>
[Voice] User <userId> successfully joined channel <channelId>
```

## Troubleshooting

### No Audio/Video Working

1. **Check Oracle Cloud NSG has UDP 40000-40100 open**
   - Most common issue!
   - WebRTC needs these UDP ports for media

2. **Check announced IP is correct**
   ```bash
   cat /home/ubuntu/BLITE/server/.env | grep ANNOUNCED_IP
   # Should be: MEDIASOUP_ANNOUNCED_IP=YOUR_SERVER_IP
   ```

3. **Check firewall allows UDP**
   ```bash
   sudo iptables -L INPUT -n -v | grep 40000
   ```

4. **Test UDP connectivity from client**
   - Use online WebRTC test tools
   - Should connect to YOUR_SERVER_IP:40000-40100

### Connection Issues Behind NAT

If clients behind strict NATs can't connect:

1. **Add TURN servers** to relay traffic
2. **Set MEDIASOUP_USE_TCP_ONLY=true** (fallback option, lower quality)

### Cloudflare Notes

- Cloudflare proxies HTTP/WebSocket (TCP 80/443)
- Cloudflare does NOT proxy WebRTC (UDP)
- WebRTC connects directly to YOUR_SERVER_IP
- Ensure Cloudflare doesn't block the public IP

## Current Status

Server running with Mediasoup
Announced IP configured: YOUR_SERVER_IP
UDP ports configured: 40000-40100
Local firewall allows UDP traffic
WebSocket signaling working
Voice channel joins working (confirmed in logs)

**Ensure Oracle Cloud NSG allows:**
- TCP 80 (for HTTP)
- UDP 40000-40100 (for WebRTC media)

## Testing Checklist

- [ ] Can access http://blite.chat (or http://YOUR_SERVER_IP)
- [ ] Can create account and login
- [ ] Can create/join server
- [ ] Can join voice channel (no errors in console)
- [ ] Can hear other users
- [ ] Can toggle mute/unmute
- [ ] Can enable camera (if supported)
- [ ] Can share screen (if supported)

## Support

For issues, check:
1. Browser console (F12)
2. Server logs: `tail -f /tmp/claude-1001/-home-ubuntu-BLITE/tasks/b8c6484.output`
3. Network tab in browser dev tools
4. WebRTC internals: chrome://webrtc-internals
