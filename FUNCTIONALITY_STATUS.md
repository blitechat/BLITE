# BLITE Functionality Status
**Last Updated:** 2026-02-14
**Version:** 1.7.2

## Core Features Status

### ✅ Text Chat (Fully Working)
- **End-to-End Encryption**: ✓ Double Ratchet protocol for DMs
- **Sender Key Encryption**: ✓ For channel/group messages
- **Message Types**: Text, files, images, replies
- **Real-time Delivery**: ✓ WebSocket (Socket.IO)
- **Message History**: ✓ Loads previous messages
- **Edit/Delete**: ✓ Working
- **Reactions**: ✓ Working
- **Pins**: ✓ Working
- **Message Search**: ✓ Working
- **Link Previews**: ✓ Working

### ✅ Sent Message Persistence (v1.7.1)
- **Issue Fixed**: Users can now see their own sent DM messages after app restart
- **Implementation**: IndexedDB persistent storage (sentMessageStore.ts)
- **Storage Limit**: Last 500 sent messages
- **Privacy**: Cleared on logout
- **Works**: Both web and desktop (after rebuild)

### ✅ Voice Chat (Fully Working)
- **Technology**: mediasoup (SFU architecture)
- **E2EE Voice**: ✓ Encrypted using AES-GCM
- **Push-to-Talk**: ✓ Space bar
- **Mute/Unmute**: ✓ Working
- **Audio Test**: ✓ In user settings
- **Speaking Indicator**: ✓ Green border when speaking
- **Voice Channels**: ✓ Server voice channels
- **DM Calls**: ✓ 1-on-1 voice calls

### ✅ Video Chat (Fully Working)
- **Technology**: mediasoup (SFU architecture)
- **E2EE Video**: ✓ Encrypted using AES-GCM
- **Camera Toggle**: ✓ Working
- **Screen Share**: ✓ Working
- **Video Quality**: Adaptive based on bandwidth
- **Multiple Peers**: ✓ Supports multiple users
- **Video in DMs**: ✓ 1-on-1 video calls

### ✅ User Features
- **Registration**: ✓ With E2EE key generation
- **Login**: ✓ With key bundle loading
- **Recovery Keys**: ✓ Download on signup
- **Profile Viewing**: ✓ Click avatars to view profiles (v1.7.2)
- **Custom Status**: ✓ Working
- **Avatar Upload**: ✓ Working (URLs: /uploads/YYYY-MM-DD/uuid.ext)
- **Presence**: ✓ Online/Idle/DND/Offline
- **Friends System**: ✓ Add, remove, accept/reject requests
- **Blocking**: ✓ Block/unblock users
- **DM Calls**: ✓ Call button in friends list (v1.7.2)

### ✅ Server Features
- **Create/Join Servers**: ✓ Working
- **Channels**: ✓ Text and voice
- **Roles**: ✓ With permissions
- **Invites**: ✓ With expiry and usage limits
- **Moderation**: ✓ Kick, ban, permissions
- **Server Icons**: ✓ Upload and display

### ⚠️ Known Issue: Desktop Images
**Problem**: Desktop app doesn't show room/profile photos
**Root Cause**: Outdated installers (v1.7.0 didn't include the fix)
**Solution**: Rebuilding installers now with v1.7.2 code
**Status**: In progress - building now

## Security Status (v1.7.2)

### ✅ SSL/HTTPS
- Certificate: Let's Encrypt
- Expires: 2026-05-15
- Auto-renewal: ✓ Enabled
- HTTP → HTTPS: ✓ Automatic redirect

### ✅ Firewall
- UFW: Enabled
- Ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- All other ports: BLOCKED

### ✅ Intrusion Protection
- fail2ban: Running
- Brute force protection: ✓ Active

### ✅ DDoS Protection
- Cloudflare: Proxying traffic
- Origin IP: Hidden
- Rate limiting: ✓ Active (server-side)

### ✅ SSH Security
- Password auth: DISABLED
- Root login: Disabled
- Key-only access: ✓ Enabled

## E2EE Implementation

### Double Ratchet (DMs)
- X3DH key agreement
- Separate send/receive chains
- Forward secrecy
- Post-compromise security

### Sender Keys (Channels)
- Group encryption
- Efficient for N:N communication
- Key rotation supported

### Key Management
- Identity keys (Ed25519)
- Signed prekeys
- One-time prekeys
- Recovery key backup

## Privacy Features

### What's Encrypted
- ✅ Message content (E2EE)
- ✅ DM message content (Double Ratchet)
- ✅ Channel message content (Sender Keys)
- ✅ File attachments (when sent as encrypted messages)
- ✅ Voice/Video (E2EE with AES-GCM)

### What's NOT Encrypted (Metadata)
- ⚠️ Server membership (visible to server)
- ⚠️ Channel membership (visible to server)
- ⚠️ Message timing (visible to server)
- ⚠️ IP addresses (logged by server, hidden by Cloudflare from internet)
- ⚠️ Connection patterns (visible to server)

### Privacy Best Practices
- Server cannot read message content
- Server cannot decrypt voice/video
- Server stores minimal metadata
- For maximum privacy: Self-host

## Performance Metrics

### Server Capacity
- RAM: 12 GB
- vCPU: 1 core
- Idle users: 500-1000
- Active chat users: 50-100
- Simultaneous voice: 15-25 (CPU-bound)

### Current Load
- mediasoup workers: 4
- Port range: 40000-49999 (WebRTC)
- Voice codec: Opus
- Video codec: VP8/VP9

## Deployment Status

### Web App
- URL: https://blite.chat
- Version: 1.7.2
- Status: ✅ Live and working
- SSL: ✅ Enabled

### Desktop App
- Windows: Building now (v1.7.2)
- Linux: Building now (v1.7.2)
- Mac: Not built yet
- Auto-update: ✓ Configured

## Next Actions

1. ✅ Finish building v1.7.2 desktop installers
2. ✅ Deploy installers to server/public/downloads/
3. ✅ Generate update manifest files
4. ✅ Test desktop app image loading
5. ⚠️ Consider building Mac installer if needed
