import path from 'path';

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
export const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    process.exit(1);
  }
  return secret || 'blite-dev-secret-change-in-production';
})();

// BLITE_MODE: 'full' (default) = voice/video via mediasoup, 'lite' = text/E2EE only
export const BLITE_MODE: 'full' | 'lite' =
  (process.env.BLITE_MODE === 'lite' ? 'lite' : 'full');
export const JWT_EXPIRES_IN = '7d';
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'blite.db');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
export const BCRYPT_ROUNDS = 12;
export const MESSAGE_PAGE_SIZE = 50;

// Telegram bot for feedback notifications
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// VAPID keys for web push notifications
// Generate with: npx web-push generate-vapid-keys
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@blite.chat';

// Permission bitflags
export const Permissions = {
  ADMIN: 1 << 0,            // 1
  MANAGE_SERVER: 1 << 1,    // 2
  MANAGE_CHANNELS: 1 << 2,  // 4
  MANAGE_ROLES: 1 << 3,     // 8
  MANAGE_MESSAGES: 1 << 4,  // 16
  KICK_MEMBERS: 1 << 5,     // 32
  BAN_MEMBERS: 1 << 6,      // 64
  SEND_MESSAGES: 1 << 7,    // 128
  READ_MESSAGES: 1 << 8,    // 256
  CONNECT_VOICE: 1 << 9,    // 512
  SPEAK_VOICE: 1 << 10,     // 1024
  ATTACH_FILES: 1 << 11,    // 2048
  CREATE_INVITES: 1 << 12,  // 4096
} as const;

// Default member permissions
export const DEFAULT_PERMISSIONS =
  Permissions.SEND_MESSAGES |
  Permissions.READ_MESSAGES |
  Permissions.CONNECT_VOICE |
  Permissions.SPEAK_VOICE |
  Permissions.ATTACH_FILES |
  Permissions.CREATE_INVITES;

// Admin gets all permissions
export const ADMIN_PERMISSIONS = Object.values(Permissions).reduce((acc, p) => acc | p, 0);

// mediasoup configuration
export const MEDIASOUP_LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';
export const MEDIASOUP_ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || '';
export const MEDIASOUP_RTC_MIN_PORT = parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || '40000', 10);
export const MEDIASOUP_RTC_MAX_PORT = parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || '49999', 10);
// Auto-detect CPU cores for optimal worker count (max 8 for cost efficiency)
import os from 'os';
const cpuCount = os.cpus().length;
const workerEnv = process.env.MEDIASOUP_NUM_WORKERS || 'auto';
export const MEDIASOUP_NUM_WORKERS = workerEnv === 'auto'
  ? Math.min(cpuCount, 8)
  : parseInt(workerEnv, 10);
export const MEDIASOUP_USE_TCP_ONLY = process.env.MEDIASOUP_USE_TCP_ONLY === 'true';
// Separate port for mediasoup WebRTC transport in TCP-only mode (must NOT be the same as PORT)
export const MEDIASOUP_TCP_PORT = parseInt(process.env.MEDIASOUP_TCP_PORT || String(MEDIASOUP_RTC_MIN_PORT), 10);
