import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { channels, messages, serverMembers, channelKeys, users, reactions, pins, readPositions, dmParticipants } from '../db/schema';
import { eq, and, desc, lt, like, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Permissions, MESSAGE_PAGE_SIZE } from '../config';
import { createAuditLog } from '../utils/auditLog';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Verify that a user has access to a channel.
 * For server channels: checks server membership.
 * For DM channels: checks DM participation.
 * Returns the channel record if access is granted, null otherwise.
 */
async function verifyChannelAccess(userId: string, channelId: string): Promise<{ serverId: string } | null> {
  // First check if it's a server channel
  const [channel] = await db
    .select({ serverId: channels.serverId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (channel) {
    // Server channel: verify membership
    const [membership] = await db
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)))
      .limit(1);

    return membership ? channel : null;
  }

  // Check if it's a DM channel
  const [dmMembership] = await db
    .select({ dmChannelId: dmParticipants.dmChannelId })
    .from(dmParticipants)
    .where(and(eq(dmParticipants.dmChannelId, channelId), eq(dmParticipants.userId, userId)))
    .limit(1);

  return dmMembership ? { serverId: '' } : null;
}

/**
 * GET /servers/:serverId/channels
 * List all channels in a server. User must be a member.
 */
router.get('/servers/:serverId/channels', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;

    // Check membership
    const [membership] = await db
      .select()
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this server' });
      return;
    }

    const serverChannels = await db
      .select()
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(channels.position);

    res.json({ channels: serverChannels });
  } catch (error) {
    console.error('List channels error:', error);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

/**
 * POST /servers/:serverId/channels
 * Create a new channel in a server. Requires MANAGE_CHANNELS permission.
 */
router.post(
  '/servers/:serverId/channels',
  requirePermission(Permissions.MANAGE_CHANNELS),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { serverId } = req.params;
      const { name, type, categoryId, position } = req.body;

      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Channel name is required' });
        return;
      }

      if (name.length > 100) {
        res.status(400).json({ error: 'Channel name must be 100 characters or less' });
        return;
      }

      const channelType = type || 'text';
      if (!['text', 'voice', 'category'].includes(channelType)) {
        res.status(400).json({ error: 'Invalid channel type. Must be text, voice, or category' });
        return;
      }

      // Get the current max position for channels in this server
      const existingChannels = await db
        .select({ position: channels.position })
        .from(channels)
        .where(eq(channels.serverId, serverId))
        .orderBy(desc(channels.position))
        .limit(1);

      const nextPosition = position ?? (existingChannels.length > 0 ? existingChannels[0].position + 1 : 0);

      const channelId = uuidv4();
      const now = new Date().toISOString();

      await db.insert(channels).values({
        id: channelId,
        serverId,
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        type: channelType,
        categoryId: categoryId || null,
        position: nextPosition,
        createdAt: now,
      });

      const [newChannel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      await createAuditLog(serverId, req.user!.id, 'CHANNEL_CREATE', channelId, 'channel', { name: name.trim(), type: channelType });

      res.status(201).json({ channel: newChannel });
    } catch (error) {
      console.error('Create channel error:', error);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  }
);

/**
 * PUT /channels/:channelId
 * Update a channel. Requires MANAGE_CHANNELS permission on the server.
 */
router.put('/channels/:channelId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;
    const { name, position, categoryId, messageExpiry } = req.body;

    // Get the channel to find its server
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Import and check permissions inline (since serverId comes from DB, not params)
    const { hasPermission } = await import('../middleware/permissions');
    const canManage = await hasPermission(userId, channel.serverId, Permissions.MANAGE_CHANNELS);
    if (!canManage) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const updates: Partial<{ name: string; position: number; categoryId: string | null; messageExpiry: string }> = {};
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Channel name cannot be empty' });
        return;
      }
      updates.name = name.trim().toLowerCase().replace(/\s+/g, '-');
    }
    if (position !== undefined) {
      updates.position = position;
    }
    if (categoryId !== undefined) {
      updates.categoryId = categoryId;
    }
    if (messageExpiry !== undefined) {
      const validExpiries = ['never', '30s', '5m', '1h', '24h', '7d'];
      if (!validExpiries.includes(messageExpiry)) {
        res.status(400).json({ error: 'Invalid message expiry value' });
        return;
      }
      updates.messageExpiry = messageExpiry;
    }

    await db
      .update(channels)
      .set(updates)
      .where(eq(channels.id, channelId));

    const [updatedChannel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    await createAuditLog(channel.serverId, userId, 'CHANNEL_UPDATE', channelId, 'channel', updates);

    res.json({ channel: updatedChannel });
  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /channels/:channelId
 * Delete a channel. Requires MANAGE_CHANNELS permission.
 */
router.delete('/channels/:channelId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;

    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const { hasPermission } = await import('../middleware/permissions');
    const canManage = await hasPermission(userId, channel.serverId, Permissions.MANAGE_CHANNELS);
    if (!canManage) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Delete messages in this channel first
    await db.delete(messages).where(eq(messages.channelId, channelId));
    await db.delete(channelKeys).where(eq(channelKeys.channelId, channelId));
    await db.delete(channels).where(eq(channels.id, channelId));

    await createAuditLog(channel.serverId, userId, 'CHANNEL_DELETE', channelId, 'channel', { name: channel.name });

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

/**
 * GET /channels/:channelId/messages
 * Get message history for a channel (paginated).
 * Query params: before (cursor ID), limit (default 50)
 */
router.get('/channels/:channelId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    const before = req.query.before as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || MESSAGE_PAGE_SIZE, 100);

    // Build the query
    let query;

    if (before) {
      // Get the createdAt of the cursor message
      const [cursorMsg] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, before))
        .limit(1);

      if (cursorMsg) {
        query = db
          .select({
            id: messages.id,
            channelId: messages.channelId,
            senderId: messages.senderId,
            encryptedContent: messages.encryptedContent,
            nonce: messages.nonce,
            type: messages.type,
            replyToId: messages.replyToId,
            createdAt: messages.createdAt,
            editedAt: messages.editedAt,
            senderUsername: users.username,
            senderDisplayName: users.displayName,
            senderAvatarUrl: users.avatarUrl,
          })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(and(eq(messages.channelId, channelId), lt(messages.createdAt, cursorMsg.createdAt)))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
      } else {
        query = db
          .select({
            id: messages.id,
            channelId: messages.channelId,
            senderId: messages.senderId,
            encryptedContent: messages.encryptedContent,
            nonce: messages.nonce,
            type: messages.type,
            replyToId: messages.replyToId,
            createdAt: messages.createdAt,
            editedAt: messages.editedAt,
            senderUsername: users.username,
            senderDisplayName: users.displayName,
            senderAvatarUrl: users.avatarUrl,
          })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(eq(messages.channelId, channelId))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
      }
    } else {
      query = db
        .select({
          id: messages.id,
          channelId: messages.channelId,
          senderId: messages.senderId,
          encryptedContent: messages.encryptedContent,
          nonce: messages.nonce,
          type: messages.type,
          replyToId: messages.replyToId,
          createdAt: messages.createdAt,
          editedAt: messages.editedAt,
          senderUsername: users.username,
          senderDisplayName: users.displayName,
          senderAvatarUrl: users.avatarUrl,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.channelId, channelId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);
    }

    const result = await query;

    // Reverse to get chronological order
    const chronological = result.reverse();

    // Get all message IDs for enrichment
    const messageIds = chronological.map(m => m.id);

    // Fetch reactions for all messages in this batch
    let reactionsForMessages: { id: string; messageId: string; userId: string; emoji: string; createdAt: string }[] = [];
    if (messageIds.length > 0) {
      reactionsForMessages = await db.select().from(reactions)
        .where(inArray(reactions.messageId, messageIds));
    }

    // Group reactions by messageId then emoji
    const reactionsMap: Record<string, { emoji: string; count: number; userIds: string[] }[]> = {};
    for (const r of reactionsForMessages) {
      if (!reactionsMap[r.messageId]) reactionsMap[r.messageId] = [];
      const group = reactionsMap[r.messageId].find(g => g.emoji === r.emoji);
      if (group) {
        group.count++;
        group.userIds.push(r.userId);
      } else {
        reactionsMap[r.messageId].push({ emoji: r.emoji, count: 1, userIds: [r.userId] });
      }
    }

    // Fetch pinned message IDs
    let pinnedIds = new Set<string>();
    if (messageIds.length > 0) {
      const matchingPins = await db.select({ messageId: pins.messageId }).from(pins)
        .where(inArray(pins.messageId, messageIds));
      pinnedIds = new Set(matchingPins.map(p => p.messageId));
    }

    // Fetch replyTo data for messages that have replyToId
    const replyToMap: Record<string, any> = {};
    for (const m of chronological) {
      if ((m as any).replyToId) {
        const replyToId = (m as any).replyToId;
        if (!replyToMap[replyToId]) {
          const [repliedMsg] = await db
            .select({
              id: messages.id,
              senderId: messages.senderId,
              encryptedContent: messages.encryptedContent,
              nonce: messages.nonce,
              senderUsername: users.username,
              senderDisplayName: users.displayName,
              senderAvatarUrl: users.avatarUrl,
            })
            .from(messages)
            .innerJoin(users, eq(messages.senderId, users.id))
            .where(eq(messages.id, replyToId))
            .limit(1);

          if (repliedMsg) {
            replyToMap[replyToId] = {
              id: repliedMsg.id,
              senderId: repliedMsg.senderId,
              encryptedContent: repliedMsg.encryptedContent,
              nonce: repliedMsg.nonce,
              sender: {
                id: repliedMsg.senderId,
                username: repliedMsg.senderUsername,
                displayName: repliedMsg.senderDisplayName,
                avatarUrl: repliedMsg.senderAvatarUrl,
              },
            };
          }
        }
      }
    }

    // Format the response
    const formattedMessages = chronological.map(m => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      encryptedContent: m.encryptedContent,
      nonce: m.nonce,
      type: m.type,
      replyToId: (m as any).replyToId || null,
      replyTo: (m as any).replyToId ? replyToMap[(m as any).replyToId] || null : null,
      reactions: reactionsMap[m.id] || [],
      isPinned: pinnedIds.has(m.id),
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      sender: {
        id: m.senderId,
        username: m.senderUsername,
        displayName: m.senderDisplayName,
        avatarUrl: m.senderAvatarUrl,
      },
    }));

    res.json({
      messages: formattedMessages,
      hasMore: result.length === limit,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * GET /channels/:channelId/key?senderId=xxx
 * Get the user's encrypted channel key for E2EE from a specific sender.
 * If senderId is provided, returns that sender's key encrypted for the current user.
 * If not provided, returns any available key (legacy fallback).
 */
router.get('/channels/:channelId/key', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;
    const senderId = req.query.senderId as string | undefined;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    let key;
    if (senderId) {
      // Get key from specific sender
      [key] = await db
        .select()
        .from(channelKeys)
        .where(and(
          eq(channelKeys.channelId, channelId),
          eq(channelKeys.userId, userId),
          eq(channelKeys.senderId, senderId)
        ))
        .limit(1);
    } else {
      // Legacy fallback: get any key for this user in this channel
      [key] = await db
        .select()
        .from(channelKeys)
        .where(and(eq(channelKeys.channelId, channelId), eq(channelKeys.userId, userId)))
        .limit(1);
    }

    if (!key) {
      res.status(404).json({ error: 'No channel key found' });
      return;
    }

    res.json(key);
  } catch (error) {
    console.error('Get channel key error:', error);
    res.status(500).json({ error: 'Failed to get channel key' });
  }
});

/**
 * POST /channels/:channelId/keys
 * Set encrypted channel keys for multiple users (used during key distribution).
 * Body: { senderId: string, keys: [{ userId: string, encryptedKey: string }] }
 * senderId identifies whose sender key is being distributed.
 */
router.post('/channels/:channelId/keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;
    const { keys, senderId } = req.body;

    // The sender distributing their key is the authenticated user
    const effectiveSenderId = senderId || userId;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      res.status(400).json({ error: 'Keys array is required' });
      return;
    }

    for (const keyEntry of keys) {
      if (!keyEntry.userId || !keyEntry.encryptedKey) {
        res.status(400).json({ error: 'Each key entry must have userId and encryptedKey' });
        return;
      }

      // Upsert the key: try to update first, insert if not exists
      const [existing] = await db
        .select()
        .from(channelKeys)
        .where(and(
          eq(channelKeys.channelId, channelId),
          eq(channelKeys.userId, keyEntry.userId),
          eq(channelKeys.senderId, effectiveSenderId)
        ))
        .limit(1);

      if (existing) {
        await db
          .update(channelKeys)
          .set({ encryptedKey: keyEntry.encryptedKey })
          .where(and(
            eq(channelKeys.channelId, channelId),
            eq(channelKeys.userId, keyEntry.userId),
            eq(channelKeys.senderId, effectiveSenderId)
          ));
      } else {
        await db.insert(channelKeys).values({
          channelId,
          userId: keyEntry.userId,
          senderId: effectiveSenderId,
          encryptedKey: keyEntry.encryptedKey,
        });
      }
    }

    res.json({ message: 'Channel keys updated' });
  } catch (error) {
    console.error('Set channel keys error:', error);
    res.status(500).json({ error: 'Failed to set channel keys' });
  }
});

/**
 * POST /channels/:channelId/pins
 * Pin a message in a channel.
 */
router.post('/channels/:channelId/pins', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;
    const { messageId } = req.body;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    if (!messageId) {
      res.status(400).json({ error: 'messageId is required' });
      return;
    }

    // Check if already pinned
    const [existing] = await db
      .select()
      .from(pins)
      .where(eq(pins.messageId, messageId))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'Message is already pinned' });
      return;
    }

    const pinId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(pins).values({
      id: pinId,
      messageId,
      channelId,
      pinnedBy: userId,
      createdAt: now,
    });

    res.status(201).json({ pin: { id: pinId, messageId, channelId, pinnedBy: userId, createdAt: now } });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

/**
 * DELETE /channels/:channelId/pins/:messageId
 * Unpin a message.
 */
router.delete('/channels/:channelId/pins/:messageId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId, messageId } = req.params;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    await db.delete(pins).where(and(eq(pins.channelId, channelId), eq(pins.messageId, messageId)));

    res.json({ message: 'Message unpinned' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

/**
 * GET /channels/:channelId/pins
 * Get all pinned messages in a channel.
 */
router.get('/channels/:channelId/pins', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    // Query 1: Fetch all pin records
    const pinnedItems = await db
      .select()
      .from(pins)
      .where(eq(pins.channelId, channelId))
      .orderBy(desc(pins.createdAt));

    if (pinnedItems.length === 0) {
      res.json({ pins: [] });
      return;
    }

    // Query 2: Batch fetch all pinned messages with user info
    const messageIds = pinnedItems.map(p => p.messageId);
    const pinnedMessages = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        senderId: messages.senderId,
        encryptedContent: messages.encryptedContent,
        nonce: messages.nonce,
        type: messages.type,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(inArray(messages.id, messageIds));

    // Create a map for quick lookup
    const messagesMap = new Map(pinnedMessages.map(msg => [msg.id, msg]));

    // Build enriched result
    const enriched = pinnedItems
      .map(pin => {
        const msg = messagesMap.get(pin.messageId);
        if (!msg) return null;

        return {
          ...pin,
          message: {
            id: msg.id,
            channelId: msg.channelId,
            senderId: msg.senderId,
            encryptedContent: msg.encryptedContent,
            nonce: msg.nonce,
            type: msg.type,
            createdAt: msg.createdAt,
            editedAt: msg.editedAt,
            sender: {
              id: msg.senderId,
              username: msg.senderUsername,
              displayName: msg.senderDisplayName,
              avatarUrl: msg.senderAvatarUrl,
            },
          },
        };
      })
      .filter(Boolean);

    res.json({ pins: enriched });
  } catch (error) {
    console.error('Get pins error:', error);
    res.status(500).json({ error: 'Failed to get pins' });
  }
});

/**
 * GET /channels/:channelId/search
 * Return recent messages for client-side search.
 * Since messages are E2EE, the server cannot search content.
 * The client decrypts and filters locally.
 * Query params: limit (default 200, max 500), before (cursor messageId)
 */
router.get('/channels/:channelId/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const before = req.query.before as string | undefined;

    let whereClause = eq(messages.channelId, channelId);

    if (before) {
      const [cursorMsg] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, before))
        .limit(1);

      if (cursorMsg) {
        whereClause = and(whereClause, lt(messages.createdAt, cursorMsg.createdAt)) as any;
      }
    }

    const results = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        senderId: messages.senderId,
        encryptedContent: messages.encryptedContent,
        nonce: messages.nonce,
        type: messages.type,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(whereClause)
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const formattedResults = results.reverse().map(m => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      encryptedContent: m.encryptedContent,
      nonce: m.nonce,
      type: m.type,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      sender: {
        id: m.senderId,
        username: m.senderUsername,
        displayName: m.senderDisplayName,
        avatarUrl: m.senderAvatarUrl,
      },
    }));

    res.json({ messages: formattedResults, hasMore: results.length === limit });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

/**
 * POST /channels/:channelId/read
 * Update read position for a channel.
 */
router.post('/channels/:channelId/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { channelId } = req.params;
    const { messageId } = req.body;

    // Verify channel access
    const access = await verifyChannelAccess(userId, channelId);
    if (!access) {
      res.status(403).json({ error: 'You do not have access to this channel' });
      return;
    }

    const now = new Date().toISOString();

    // Upsert read position
    const [existing] = await db
      .select()
      .from(readPositions)
      .where(and(eq(readPositions.channelId, channelId), eq(readPositions.userId, userId)))
      .limit(1);

    if (existing) {
      await db
        .update(readPositions)
        .set({ lastReadMessageId: messageId || null, lastReadAt: now })
        .where(and(eq(readPositions.channelId, channelId), eq(readPositions.userId, userId)));
    } else {
      await db.insert(readPositions).values({
        channelId,
        userId,
        lastReadMessageId: messageId || null,
        lastReadAt: now,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update read position error:', error);
    res.status(500).json({ error: 'Failed to update read position' });
  }
});

/**
 * GET /channels/read-positions
 * Get all read positions for the current user.
 */
router.get('/read-positions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const positions = await db
      .select()
      .from(readPositions)
      .where(eq(readPositions.userId, userId));

    res.json({ positions });
  } catch (error) {
    console.error('Get read positions error:', error);
    res.status(500).json({ error: 'Failed to get read positions' });
  }
});

export default router;
