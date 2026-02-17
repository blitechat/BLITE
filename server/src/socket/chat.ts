import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { messages, channels, serverMembers, users, reactions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AuthenticatedSocket } from '../middleware/auth';
import { hasPermission } from '../middleware/permissions';
import { Permissions } from '../config';
import { sendPushNotification } from '../utils/pushNotify';

interface SendMessagePayload {
  channelId: string;
  encryptedContent: string;
  nonce?: string;
  type?: 'text' | 'file' | 'system';
  replyToId?: string;
}

interface EditMessagePayload {
  messageId: string;
  encryptedContent: string;
  nonce?: string;
}

interface DeleteMessagePayload {
  messageId: string;
  channelId: string;
}

interface ReactionPayload {
  messageId: string;
  channelId: string;
  emoji: string;
}

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

// Rate limiting maps
const messageRateLimits = new Map<string, RateLimitRecord>();
const reactionRateLimits = new Map<string, RateLimitRecord>();

// Rate limit configuration
const MESSAGE_LIMIT = 30; // messages per minute
const REACTION_LIMIT = 60; // reactions per minute
const WINDOW_MS = 60000; // 1 minute

/**
 * Check if a user has exceeded their rate limit
 * @param userId - User ID to check
 * @param limitMap - The rate limit map to check
 * @param limit - Maximum actions allowed in the window
 * @returns true if rate limit exceeded, false otherwise
 */
function checkRateLimit(userId: string, limitMap: Map<string, RateLimitRecord>, limit: number): boolean {
  const now = Date.now();
  const record = limitMap.get(userId);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // New window
    limitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }

  if (record.count >= limit) {
    // Rate limit exceeded
    return true;
  }

  // Increment count
  record.count++;
  return false;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of messageRateLimits.entries()) {
    if (now - record.windowStart > WINDOW_MS * 2) {
      messageRateLimits.delete(userId);
    }
  }
  for (const [userId, record] of reactionRateLimits.entries()) {
    if (now - record.windowStart > WINDOW_MS * 2) {
      reactionRateLimits.delete(userId);
    }
  }
}, 300000);

/**
 * Register chat-related socket event handlers.
 */
export function registerChatHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  const userId = socket.user.id;

  /**
   * message:send
   * Validate, store encrypted message in DB, broadcast to channel room.
   */
  socket.on('message:send', async (payload: SendMessagePayload, callback?: Function) => {
    try {
      // Check rate limit first
      if (checkRateLimit(userId, messageRateLimits, MESSAGE_LIMIT)) {
        if (callback) callback({ error: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      const { channelId, encryptedContent, nonce, type, replyToId } = payload;

      if (!channelId || !encryptedContent) {
        if (callback) callback({ error: 'channelId and encryptedContent are required' });
        return;
      }

      const messageType = type || 'text';
      if (!['text', 'file', 'system'].includes(messageType)) {
        if (callback) callback({ error: 'Invalid message type' });
        return;
      }

      // Parallelize independent queries for better performance
      const [channelResult, senderResult, replyMsgResult] = await Promise.all([
        // Query 1: Get channel
        db.select()
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1),

        // Query 2: Get sender info (parallel)
        db.select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),

        // Query 3: Get reply message if specified (restrict to same channel)
        replyToId
          ? db.select({
              id: messages.id,
              senderId: messages.senderId,
              encryptedContent: messages.encryptedContent,
              nonce: messages.nonce,
            })
              .from(messages)
              .where(and(eq(messages.id, replyToId), eq(messages.channelId, channelId)))
              .limit(1)
          : Promise.resolve([]),
      ]);

      const [channel] = channelResult;
      const [sender] = senderResult;
      const [repliedMsg] = replyMsgResult;

      // Verify sender exists
      if (!sender) {
        if (callback) callback({ error: 'Sender not found' });
        return;
      }

      // Verify channel access
      if (channel) {
        // Server channel: check membership and permissions
        const [membership, canSendMessages] = await Promise.all([
          db.select()
            .from(serverMembers)
            .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)))
            .limit(1),
          hasPermission(userId, channel.serverId, Permissions.SEND_MESSAGES),
        ]);

        if (!membership[0]) {
          if (callback) callback({ error: 'You are not a member of this server' });
          return;
        }

        if (!canSendMessages) {
          if (callback) callback({ error: 'You do not have permission to send messages in this channel' });
          return;
        }
      }
      // If not a server channel, it could be a DM channel (we trust auth for DMs)

      // Build reply object if reply message exists
      let replyTo = null;
      if (repliedMsg) {
        const [replySender] = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, repliedMsg.senderId))
          .limit(1);

        replyTo = {
          id: repliedMsg.id,
          senderId: repliedMsg.senderId,
          encryptedContent: repliedMsg.encryptedContent,
          nonce: repliedMsg.nonce,
          sender: replySender || undefined,
        };
      }

      // Compute expiresAt from channel's messageExpiry
      let expiresAt: string | null = null;
      if (channel && channel.messageExpiry && channel.messageExpiry !== 'never') {
        const expiryMs: Record<string, number> = {
          '30s': 30 * 1000,
          '5m': 5 * 60 * 1000,
          '1h': 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
        };
        const ms = expiryMs[channel.messageExpiry];
        if (ms) {
          expiresAt = new Date(Date.now() + ms).toISOString();
        }
      }

      // Store the message
      const messageId = uuidv4();
      const now = new Date().toISOString();

      await db.insert(messages).values({
        id: messageId,
        channelId,
        senderId: userId,
        encryptedContent,
        nonce: nonce || null,
        type: messageType,
        replyToId: replyToId || null,
        expiresAt,
        createdAt: now,
      });

      const messageData = {
        id: messageId,
        channelId,
        senderId: userId,
        encryptedContent,
        nonce: nonce || null,
        type: messageType,
        replyToId: replyToId || null,
        replyTo,
        expiresAt,
        reactions: [],
        createdAt: now,
        editedAt: null,
        sender: {
          id: sender.id,
          username: sender.username,
          displayName: sender.displayName,
          avatarUrl: sender.avatarUrl,
        },
      };

      // Broadcast to all users in the channel room
      io.to(`channel:${channelId}`).emit('message:new', messageData);

      // Send push notifications to offline/disconnected members
      if (channel) {
        // Get channel members who are NOT in the socket room
        const room = io.sockets.adapter.rooms.get(`channel:${channelId}`);
        const connectedSocketIds = room ? [...room] : [];
        const connectedUserIds = new Set<string>();
        for (const sid of connectedSocketIds) {
          const s = io.sockets.sockets.get(sid) as any;
          if (s?.data?.userId) connectedUserIds.add(s.data.userId);
        }

        try {
          const memberRows = await db
            .select({ userId: serverMembers.userId })
            .from(serverMembers)
            .where(eq(serverMembers.serverId, channel.serverId));

          for (const row of memberRows) {
            if (row.userId !== userId && !connectedUserIds.has(row.userId)) {
              sendPushNotification(
                row.userId,
                `${sender.displayName} in #${channel.name}`,
                encryptedContent.substring(0, 100),
                { channelId, serverId: channel.serverId }
              ).catch(() => {});
            }
          }
        } catch {
          // Non-critical - ignore push notification errors
        }
      }

      // Acknowledge to the sender
      if (callback) callback({ message: messageData });
    } catch (error) {
      console.error('message:send error:', error);
      if (callback) callback({ error: 'Failed to send message' });
    }
  });

  /**
   * message:edit
   * Validate ownership, update in DB, broadcast to channel room.
   */
  socket.on('message:edit', async (payload: EditMessagePayload, callback?: Function) => {
    try {
      const { messageId, encryptedContent, nonce } = payload;

      if (!messageId || !encryptedContent) {
        if (callback) callback({ error: 'messageId and encryptedContent are required' });
        return;
      }

      // Get the message
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        if (callback) callback({ error: 'Message not found' });
        return;
      }

      // Only the sender can edit their own messages
      if (message.senderId !== userId) {
        if (callback) callback({ error: 'You can only edit your own messages' });
        return;
      }

      const editedAt = new Date().toISOString();

      await db
        .update(messages)
        .set({
          encryptedContent,
          nonce: nonce || message.nonce,
          editedAt,
        })
        .where(eq(messages.id, messageId));

      const editData = {
        id: messageId,
        channelId: message.channelId,
        encryptedContent,
        nonce: nonce || message.nonce,
        editedAt,
      };

      // Broadcast edit to the channel
      io.to(`channel:${message.channelId}`).emit('message:edited', editData);

      if (callback) callback({ message: editData });
    } catch (error) {
      console.error('message:edit error:', error);
      if (callback) callback({ error: 'Failed to edit message' });
    }
  });

  /**
   * message:delete
   * Validate ownership or MANAGE_MESSAGES permission, delete from DB, broadcast.
   */
  socket.on('message:delete', async (payload: DeleteMessagePayload, callback?: Function) => {
    try {
      const { messageId, channelId } = payload;

      if (!messageId) {
        if (callback) callback({ error: 'messageId is required' });
        return;
      }

      // Get the message
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        if (callback) callback({ error: 'Message not found' });
        return;
      }

      // Check if user is the sender
      let canDelete = message.senderId === userId;

      // If not the sender, check MANAGE_MESSAGES permission
      if (!canDelete) {
        // Find the server this channel belongs to
        const [channel] = await db
          .select()
          .from(channels)
          .where(eq(channels.id, message.channelId))
          .limit(1);

        if (channel) {
          canDelete = await hasPermission(userId, channel.serverId, Permissions.MANAGE_MESSAGES);
        }
      }

      if (!canDelete) {
        if (callback) callback({ error: 'You do not have permission to delete this message' });
        return;
      }

      await db.delete(messages).where(eq(messages.id, messageId));

      const deleteData = {
        id: messageId,
        channelId: message.channelId,
      };

      // Broadcast deletion to the channel
      io.to(`channel:${message.channelId}`).emit('message:deleted', deleteData);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('message:delete error:', error);
      if (callback) callback({ error: 'Failed to delete message' });
    }
  });

  /**
   * reaction:add
   * Add a reaction to a message. Broadcasts to channel room.
   */
  socket.on('reaction:add', async (payload: ReactionPayload, callback?: Function) => {
    try {
      // Check rate limit first
      if (checkRateLimit(userId, reactionRateLimits, REACTION_LIMIT)) {
        if (callback) callback({ error: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      const { messageId, channelId, emoji } = payload;

      if (!messageId || !emoji) {
        if (callback) callback({ error: 'messageId and emoji are required' });
        return;
      }

      // Validate emoji: max 32 chars, no control characters
      if (typeof emoji !== 'string' || emoji.length > 32 || emoji.length === 0 || /[\x00-\x1f\x7f]/.test(emoji)) {
        if (callback) callback({ error: 'Invalid emoji' });
        return;
      }

      // Check if reaction already exists
      const [existing] = await db
        .select()
        .from(reactions)
        .where(and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji)
        ))
        .limit(1);

      if (existing) {
        if (callback) callback({ error: 'Reaction already exists' });
        return;
      }

      // Limit distinct emoji per message to 20
      const existingReactions = await db
        .select({ emoji: reactions.emoji })
        .from(reactions)
        .where(eq(reactions.messageId, messageId));
      const distinctEmoji = new Set(existingReactions.map(r => r.emoji));
      if (!distinctEmoji.has(emoji) && distinctEmoji.size >= 20) {
        if (callback) callback({ error: 'Maximum number of unique reactions reached for this message' });
        return;
      }

      const reactionId = uuidv4();
      const now = new Date().toISOString();

      await db.insert(reactions).values({
        id: reactionId,
        messageId,
        userId,
        emoji,
        createdAt: now,
      });

      // Get all reactions for this message grouped by emoji
      const allReactions = await db
        .select()
        .from(reactions)
        .where(eq(reactions.messageId, messageId));

      const grouped: Record<string, string[]> = {};
      for (const r of allReactions) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.userId);
      }

      const reactionGroups = Object.entries(grouped).map(([em, userIds]) => ({
        emoji: em,
        count: userIds.length,
        userIds,
      }));

      io.to(`channel:${channelId}`).emit('reaction:updated', {
        messageId,
        channelId,
        reactions: reactionGroups,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('reaction:add error:', error);
      if (callback) callback({ error: 'Failed to add reaction' });
    }
  });

  /**
   * reaction:remove
   * Remove a reaction from a message. Broadcasts to channel room.
   */
  socket.on('reaction:remove', async (payload: ReactionPayload, callback?: Function) => {
    try {
      const { messageId, channelId, emoji } = payload;

      if (!messageId || !emoji) {
        if (callback) callback({ error: 'messageId and emoji are required' });
        return;
      }

      await db.delete(reactions).where(and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, userId),
        eq(reactions.emoji, emoji)
      ));

      // Get remaining reactions
      const allReactions = await db
        .select()
        .from(reactions)
        .where(eq(reactions.messageId, messageId));

      const grouped: Record<string, string[]> = {};
      for (const r of allReactions) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.userId);
      }

      const reactionGroups = Object.entries(grouped).map(([em, userIds]) => ({
        emoji: em,
        count: userIds.length,
        userIds,
      }));

      io.to(`channel:${channelId}`).emit('reaction:updated', {
        messageId,
        channelId,
        reactions: reactionGroups,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('reaction:remove error:', error);
      if (callback) callback({ error: 'Failed to remove reaction' });
    }
  });
}
