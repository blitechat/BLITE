# Changelog

## [1.0.4] - 2026-02-13

### Security Enhancements
- **Rate Limiting**: Added comprehensive rate limiting to prevent abuse
  - General API: 100 requests per 15 minutes
  - Authentication: 10 attempts per 15 minutes
  - Registration: 5 registrations per hour
  - Uploads: 50 uploads per 15 minutes
  - Messages: 30 messages per minute
- **Security Headers**: Added Helmet.js for security headers
- **SSRF Protection**: Link preview now validates URLs to prevent internal network scanning
- **Input Validation**: Added express-validator for comprehensive input sanitization
- **File Upload Validation**: Restricted file types and added MIME type checking

### Performance Optimizations
- **Auto-scaling Workers**: Mediasoup workers now auto-scale based on CPU cores (max 8)
- **Dead Worker Recovery**: Automatic replacement of crashed mediasoup workers
- **Database Optimization**: Enhanced SQLite performance with optimized pragmas
  - 64MB cache size
  - Memory-mapped I/O (256MB)
  - Optimized page size and checkpointing
- **Expanded Port Range**: RTC ports expanded from 101 to 10,000 (40000-49999)
- **Connection Pooling**: Improved database connection management

### Reliability Improvements
- **Graceful Shutdown**: Proper cleanup of connections and workers on shutdown
- **Error Handling**: Better uncaught exception and unhandled rejection handling
- **Health Monitoring**: Enhanced health check endpoint with memory and uptime metrics
- **Metrics Endpoint**: Added `/api/metrics` for monitoring CPU, memory, and uptime

### Monitoring & Observability
- **Structured Logging**: Added structured logger with log levels
- **Performance Metrics**: Basic performance monitoring endpoints
- **Worker Status**: Real-time mediasoup worker health tracking

### Infrastructure Improvements
- **Environment Validation**: Better environment variable handling
- **Configuration Optimization**: Auto-detect optimal worker count
- **Memory Management**: Proper cleanup to prevent memory leaks

### Documentation
- Added comprehensive `INFRASTRUCTURE_ANALYSIS.md` with:
  - Security vulnerability assessment
  - Performance bottleneck analysis
  - Scalability recommendations
  - Deployment checklist
  - Maintenance guidelines

### Bug Fixes
- Fixed mediasoup worker crashes causing reduced capacity
- Fixed potential memory leaks in voice connections
- Fixed CORS configuration for Electron desktop app
- Fixed link preview timeout issues

### Breaking Changes
None

### Migration Guide
1. Update `.env` file with new variables (see `.env.example`)
2. Ensure `JWT_SECRET` is set to a secure random string in production
3. Set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP
4. Adjust `MEDIASOUP_RTC_MAX_PORT` if needed (default: 49999)
5. Restart server to apply changes

---

## [1.0.3] - 2026-02-11

### Features
- Added emoji picker with category support
- Added markdown rendering for messages
- Added message reactions
- Added message replies with context
- Added user mentions with @ syntax
- Added message pinning
- Added message search
- Added link previews
- Added kick/ban functionality
- Added user blocking
- Added unread message indicators
- Added notification sounds

### Bug Fixes
- Fixed message reply UI
- Fixed link preview caching
- Fixed auto-update IPC communication

---

## [1.0.2] - 2026-02-10

### Features
- Auto-update functionality
- Desktop app installers for Windows and Linux

### Bug Fixes
- Fixed CORS for Electron desktop app
- Fixed IPC communication between main and renderer

---

## [1.0.1] - 2026-02-09

### Initial Release
- End-to-end encrypted messaging
- Voice and video calls with mediasoup
- Server and channel management
- Direct messages
- Friend system
- File uploads
- User presence
