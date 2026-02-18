import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PORT, CORS_ORIGIN, UPLOAD_DIR, BLITE_MODE } from './config';
import { initializeSocketIO } from './socket/index';
import { apiLimiter } from './middleware/rateLimiter';
import { initializeWorkers, shutdownWorkers } from './socket/mediasoupManager';

// Import route handlers
import authRoutes from './routes/auth';
import serverRoutes from './routes/servers';
import channelRoutes from './routes/channels';
import userRoutes from './routes/users';
import inviteRoutes from './routes/invites';
import uploadRoutes from './routes/upload';
import messageRoutes from './routes/messages';
import dmRoutes from './routes/dms';
import friendRoutes from './routes/friends';
import blockRoutes from './routes/blocks';
import keyRoutes from './routes/keys';
import roleRoutes from './routes/roles';
import notificationRoutes from './routes/notifications';
import feedbackRoutes from './routes/feedback';

// Initialize the database (connection.ts auto-creates tables on import)
import './db/connection';

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for WebRTC
  crossOriginEmbedderPolicy: false, // Disable for WebRTC
}));

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Middleware
const allowedOrigins = CORS_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Electron desktop app, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add correlation ID to all requests for easier debugging
app.use((req, _res, next) => {
  (req as any).correlationId = uuidv4();
  next();
});

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Serve uploaded files statically with permissive CORS for images
app.use('/uploads', cors({ origin: '*' }), express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Health check endpoint (no rate limit)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Metrics endpoint (basic)
app.get('/api/metrics', (_req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api', channelRoutes);         // /api/servers/:serverId/channels and /api/channels/:channelId
app.use('/api', userRoutes);            // /api/users/:userId and /api/users/search
app.use('/api', inviteRoutes);          // /api/servers/:serverId/invites and /api/invites/:code
app.use('/api', uploadRoutes);          // /api/upload
app.use('/api/messages', messageRoutes); // placeholder
app.use('/api', dmRoutes);              // /api/dms
app.use('/api', friendRoutes);          // /api/friends, /api/friends/request, etc.
app.use('/api/blocks', blockRoutes);   // /api/blocks
app.use('/api/keys', keyRoutes);       // /api/keys (E2EE key bundles & recovery)
app.use('/api', roleRoutes);           // /api/servers/:serverId/roles, /api/roles/:roleId
app.use('/api/notifications', notificationRoutes); // /api/notifications/*
app.use('/api/feedback', feedbackRoutes);         // /api/feedback

// 404 handler for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve web frontend (built React app)
const webDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(webDir)) {
  // Serve downloads with proper Content-Disposition for browser downloads
  const downloadsDir = path.join(webDir, 'downloads');
  if (fs.existsSync(downloadsDir)) {
    app.use('/downloads', express.static(downloadsDir, {
      setHeaders: (res, filePath) => {
        const filename = path.basename(filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
    }));
  }

  app.use(express.static(webDir));
  // SPA fallback: serve index.html for all non-API, non-file routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDir, 'index.html'));
  });
}

// Global error handler with correlation ID
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = (req as any).correlationId || 'unknown';
  console.error(`[${correlationId}] Unhandled error:`, err);
  res.status(500).json({
    error: 'Internal server error',
    correlationId,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);
const io = initializeSocketIO(httpServer);

// Disappearing messages cleanup interval (every 30 seconds)
import { db } from './db/connection';
import { messages } from './db/schema';
import { lt, isNotNull, and } from 'drizzle-orm';

setInterval(async () => {
  try {
    const now = new Date().toISOString();
    // Find expired messages
    const expired = await db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .where(and(isNotNull(messages.expiresAt), lt(messages.expiresAt, now)));

    if (expired.length > 0) {
      // Group by channelId to emit events
      const channelIds = new Set(expired.map(m => m.channelId));

      // Delete expired messages
      for (const msg of expired) {
        await db.delete(messages).where(lt(messages.expiresAt, now));
        break; // Delete all in one query
      }

      // Emit message:expired to affected channels
      for (const channelId of channelIds) {
        const expiredIds = expired.filter(m => m.channelId === channelId).map(m => m.id);
        io.to(`channel:${channelId}`).emit('message:expired', { channelId, messageIds: expiredIds });
      }
    }
  } catch (err) {
    // Silently ignore cleanup errors
  }
}, 30000);

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Close Socket.IO
  io.close(() => {
    console.log('Socket.IO closed');
  });

  // Shutdown mediasoup workers (only in full mode)
  if (BLITE_MODE === 'full') {
    try {
      await shutdownWorkers();
      console.log('Mediasoup workers closed');
    } catch (err) {
      console.error('Error closing mediasoup workers:', err);
    }
  }

  // Give existing requests time to complete
  setTimeout(() => {
    console.log('Forcing shutdown');
    process.exit(0);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server (with mediasoup workers in full mode)
(async () => {
  console.log(`BLITE mode: ${BLITE_MODE}`);

  if (BLITE_MODE === 'full') {
    try {
      await initializeWorkers();
      console.log('[mediasoup] Workers initialized');
    } catch (err) {
      console.error('[mediasoup] Failed to initialize workers:', err);
      process.exit(1);
    }
  } else {
    console.log('[lite] Voice/video disabled — text, E2EE, and file sharing active');
  }

  httpServer.listen(PORT, () => {
    console.log(`BLITE server running on port ${PORT}`);
    console.log(`CORS origin: ${CORS_ORIGIN}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
})();

export { app, httpServer, io };
