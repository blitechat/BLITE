import { Server as SocketServer } from 'socket.io';
import { db } from '../db/connection';
import { users, serverMembers, servers, friendships } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AuthenticatedSocket } from '../middleware/auth';

interface PresenceUpdatePayload {
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string | null;
}

// Server-side typing timeout: auto-clear typing after 8 seconds
const TYPING_TIMEOUT_MS = 8000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Register presence-related socket event handlers.
 */
export function registerPresenceHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  const userId = socket.user.id;

  /**
   * typing:start
   * Broadcast to the channel room that the user started typing.
   * Auto-clears after TYPING_TIMEOUT_MS if no stop is received.
   */
  socket.on('typing:start', (payload: { channelId: string }) => {
    if (!payload.channelId) return;

    // Only broadcast if user is in the channel room
    if (!socket.rooms.has(`channel:${payload.channelId}`)) return;

    socket.to(`channel:${payload.channelId}`).emit('typing:start', {
      userId,
      username: socket.user.username,
      displayName: socket.user.displayName,
      channelId: payload.channelId,
    });

    // Set/reset server-side timeout to auto-clear typing
    const timerKey = `${userId}:${payload.channelId}`;
    const existing = typingTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    typingTimers.set(timerKey, setTimeout(() => {
      typingTimers.delete(timerKey);
      socket.to(`channel:${payload.channelId}`).emit('typing:stop', {
        userId,
        channelId: payload.channelId,
      });
    }, TYPING_TIMEOUT_MS));
  });

  /**
   * typing:stop
   * Broadcast to the channel room that the user stopped typing.
   */
  socket.on('typing:stop', (payload: { channelId: string }) => {
    if (!payload.channelId) return;

    // Only broadcast if user is in the channel room
    if (!socket.rooms.has(`channel:${payload.channelId}`)) return;

    // Clear any pending server-side timeout
    const timerKey = `${userId}:${payload.channelId}`;
    const existing = typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      typingTimers.delete(timerKey);
    }

    socket.to(`channel:${payload.channelId}`).emit('typing:stop', {
      userId,
      channelId: payload.channelId,
    });
  });

  // Clean up typing timers on disconnect
  socket.on('disconnect', () => {
    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
  });

  /**
   * presence:update
   * Update the user's status in the DB and broadcast to all servers they are in.
   */
  socket.on('presence:update', async (payload: PresenceUpdatePayload, callback?: Function) => {
    try {
      const { status, customStatus } = payload;

      if (!status || !['online', 'idle', 'dnd', 'offline'].includes(status)) {
        if (callback) callback({ error: 'Invalid status' });
        return;
      }

      // Update status in DB
      const updates: Partial<{ status: string; customStatus: string | null }> = { status };
      if (customStatus !== undefined) {
        updates.customStatus = customStatus;
      }

      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId));

      // Get all servers the user is a member of
      const memberships = await db
        .select({ serverId: serverMembers.serverId })
        .from(serverMembers)
        .where(eq(serverMembers.userId, userId));

      // Broadcast presence update to all server rooms
      const presenceData = {
        userId,
        username: socket.user.username,
        displayName: socket.user.displayName,
        status,
        customStatus: customStatus !== undefined ? customStatus : undefined,
      };

      for (const { serverId } of memberships) {
        io.to(`server:${serverId}`).emit('presence:update', presenceData);
      }

      // Also notify friends
      const userFriends = await db
        .select({ friendId: friendships.friendId })
        .from(friendships)
        .where(eq(friendships.userId, userId));
      for (const { friendId } of userFriends) {
        io.to(`user:${friendId}`).emit('presence:update', presenceData);
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('presence:update error:', error);
      if (callback) callback({ error: 'Failed to update presence' });
    }
  });
}

/**
 * Set user status to online and broadcast to all their servers.
 */
export async function setUserOnline(io: SocketServer, socket: AuthenticatedSocket): Promise<void> {
  const userId = socket.user.id;

  try {
    await db
      .update(users)
      .set({ status: 'online' })
      .where(eq(users.id, userId));

    const memberships = await db
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(eq(serverMembers.userId, userId));

    const presenceData = {
      userId,
      username: socket.user.username,
      displayName: socket.user.displayName,
      status: 'online',
    };

    for (const { serverId } of memberships) {
      socket.to(`server:${serverId}`).emit('presence:update', presenceData);
    }

    // Notify friends
    const userFriends = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, userId));
    for (const { friendId } of userFriends) {
      io.to(`user:${friendId}`).emit('presence:update', presenceData);
    }
  } catch (error) {
    console.error('setUserOnline error:', error);
  }
}

/**
 * Set user status to offline and broadcast to all their servers.
 * Only sets offline if no other sockets are connected for this user.
 */
export async function setUserOffline(io: SocketServer, socket: AuthenticatedSocket): Promise<void> {
  const userId = socket.user.id;

  try {
    // Check if the user has other active socket connections
    const sockets = await io.fetchSockets();
    const otherSockets = sockets.filter(
      (s) => (s as any).user?.id === userId && s.id !== socket.id
    );

    // Only set offline if no other connections exist
    if (otherSockets.length > 0) return;

    await db
      .update(users)
      .set({ status: 'offline' })
      .where(eq(users.id, userId));

    const memberships = await db
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(eq(serverMembers.userId, userId));

    const presenceData = {
      userId,
      username: socket.user.username,
      displayName: socket.user.displayName,
      status: 'offline',
    };

    for (const { serverId } of memberships) {
      io.to(`server:${serverId}`).emit('presence:update', presenceData);
    }

    // Notify friends
    const userFriends = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, userId));
    for (const { friendId } of userFriends) {
      io.to(`user:${friendId}`).emit('presence:update', presenceData);
    }
  } catch (error) {
    console.error('setUserOffline error:', error);
  }
}
