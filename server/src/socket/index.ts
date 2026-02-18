import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { db } from '../db/connection';
import { serverMembers, channels, dmParticipants } from '../db/schema';
import { eq } from 'drizzle-orm';
import { socketAuthMiddleware, AuthenticatedSocket } from '../middleware/auth';
import { registerChatHandlers } from './chat';
import { registerPresenceHandlers, setUserOnline, setUserOffline } from './presence';
import { registerVoiceHandlers } from './voice';
import { registerCallHandlers } from './call';
import { setIO } from './io';
import { CORS_ORIGIN, BLITE_MODE } from '../config';

/**
 * Initialize Socket.IO on the HTTP server.
 * Sets up authentication, room management, and event handlers.
 */
export function initializeSocketIO(httpServer: HttpServer): SocketServer {
  const allowedOrigins = CORS_ORIGIN.split(',').map(o => o.trim());
  const io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Store IO reference for use by routes
  setIO(io);

  // Apply JWT authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.user.id;

    console.log(`Socket connected: ${userId} (${socket.user.username})`);

    try {
      // Join all server rooms and their channel rooms
      const memberships = await db
        .select({ serverId: serverMembers.serverId })
        .from(serverMembers)
        .where(eq(serverMembers.userId, userId));

      for (const { serverId } of memberships) {
        // Join the server room (for presence broadcasts)
        socket.join(`server:${serverId}`);

        // Join all channel rooms in this server
        const serverChannels = await db
          .select({ id: channels.id })
          .from(channels)
          .where(eq(channels.serverId, serverId));

        for (const channel of serverChannels) {
          socket.join(`channel:${channel.id}`);
        }
      }

      // Join DM channel rooms
      const dmMemberships = await db
        .select({ dmChannelId: dmParticipants.dmChannelId })
        .from(dmParticipants)
        .where(eq(dmParticipants.userId, userId));

      for (const { dmChannelId } of dmMemberships) {
        socket.join(`channel:${dmChannelId}`);
      }

      // Join personal room for friend notifications and calls
      socket.join(`user:${userId}`);
      console.log(`[Socket] User ${userId} joined personal room: user:${userId}`);

      // Set user online and broadcast presence
      await setUserOnline(io, socket);

      // Register event handlers
      registerChatHandlers(io, socket);
      registerPresenceHandlers(io, socket);
      if (BLITE_MODE === 'full') {
        registerVoiceHandlers(io, socket);
        registerCallHandlers(io, socket);
      }

      // Handle joining a specific channel room (for when users navigate to channels)
      socket.on('channel:join', (payload: { channelId: string }) => {
        if (payload.channelId) {
          socket.join(`channel:${payload.channelId}`);
        }
      });

      // Handle leaving a channel room
      socket.on('channel:leave', (payload: { channelId: string }) => {
        if (payload.channelId) {
          socket.leave(`channel:${payload.channelId}`);
        }
      });

      // E2EE: relay rekey request to the target sender's personal room
      socket.on('channel:rekey-request', (payload: { channelId: string; senderId: string }) => {
        if (payload.channelId && payload.senderId) {
          io.to(`user:${payload.senderId}`).emit('channel:rekey-request', {
            channelId: payload.channelId,
            requesterId: userId,
          });
        }
      });

      // E2EE: relay DM session reset to the target user
      // When a receiver can't decrypt, they ask the sender to clear their stale session
      socket.on('dm:session-reset', (payload: { targetUserId: string }) => {
        if (payload.targetUserId) {
          io.to(`user:${payload.targetUserId}`).emit('dm:session-reset', {
            fromUserId: userId,
          });
        }
      });

      // Handle joining a server room (after accepting an invite)
      socket.on('server:join', async (payload: { serverId: string }) => {
        if (payload.serverId) {
          socket.join(`server:${payload.serverId}`);

          // Also join all channels in that server
          const serverChannels = await db
            .select({ id: channels.id })
            .from(channels)
            .where(eq(channels.serverId, payload.serverId));

          for (const channel of serverChannels) {
            socket.join(`channel:${channel.id}`);
          }
        }
      });

      // Handle disconnect
      socket.on('disconnect', async () => {
        console.log(`Socket disconnected: ${userId} (${socket.user.username})`);
        await setUserOffline(io, socket);
      });

    } catch (error) {
      console.error('Socket connection setup error:', error);
      socket.disconnect(true);
    }
  });

  return io;
}
