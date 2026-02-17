import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { dmChannels, dmParticipants, messages, users } from '../db/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /dms
 * List all DM channels for the authenticated user, with last message and participant info.
 */
router.get('/dms', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get all DM channels the user is in
    const userDmParticipants = await db
      .select({
        dmChannelId: dmParticipants.dmChannelId,
      })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, userId));

    if (userDmParticipants.length === 0) {
      res.json({ dmChannels: [] });
      return;
    }

    const dmChannelIds = userDmParticipants.map(p => p.dmChannelId);

    // Batch query 1: Get all DM channels at once
    const channels = await db
      .select()
      .from(dmChannels)
      .where(inArray(dmChannels.id, dmChannelIds));

    const channelsMap = new Map(channels.map(c => [c.id, c]));

    // Batch query 2: Get ALL participants for all channels at once
    const allParticipants = await db
      .select({
        dmChannelId: dmParticipants.dmChannelId,
        id: dmParticipants.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        publicKey: users.publicKey,
      })
      .from(dmParticipants)
      .innerJoin(users, eq(dmParticipants.userId, users.id))
      .where(inArray(dmParticipants.dmChannelId, dmChannelIds));

    // Group participants by channel
    const participantsByChannel = new Map<string, typeof allParticipants>();
    for (const participant of allParticipants) {
      const channelId = participant.dmChannelId;
      if (!participantsByChannel.has(channelId)) {
        participantsByChannel.set(channelId, []);
      }
      participantsByChannel.get(channelId)!.push(participant);
    }

    // Batch query 3: Get last message for each channel using subquery
    const lastMessages = await db
      .select({
        channelId: messages.channelId,
        id: messages.id,
        senderId: messages.senderId,
        encryptedContent: messages.encryptedContent,
        type: messages.type,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        sql`${messages.id} IN (
          SELECT id FROM (
            SELECT id, channel_id, created_at,
              ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC) as rn
            FROM ${messages}
            WHERE ${inArray(messages.channelId, dmChannelIds)}
          ) subquery
          WHERE rn = 1
        )`
      );

    const lastMessagesByChannel = new Map(lastMessages.map(m => [m.channelId, m]));

    // Build result from batched data
    const result = dmChannelIds.map(dmChannelId => {
      const channel = channelsMap.get(dmChannelId);
      if (!channel) return null;

      const participants = participantsByChannel.get(dmChannelId)?.map(p => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        status: p.status,
        publicKey: p.publicKey,
      })) || [];

      const lastMessage = lastMessagesByChannel.get(dmChannelId);

      return {
        id: channel.id,
        type: channel.type,
        createdAt: channel.createdAt,
        participants,
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          encryptedContent: lastMessage.encryptedContent,
          type: lastMessage.type,
          createdAt: lastMessage.createdAt,
        } : null,
      };
    }).filter(Boolean);

    // Sort by last message date (most recent first)
    result.sort((a, b) => {
      const aDate = a!.lastMessage?.createdAt || a!.createdAt;
      const bDate = b!.lastMessage?.createdAt || b!.createdAt;
      return bDate.localeCompare(aDate);
    });

    res.json({ dmChannels: result });
  } catch (error) {
    console.error('List DMs error:', error);
    res.status(500).json({ error: 'Failed to list DM channels' });
  }
});

/**
 * POST /dms
 * Create a DM channel with another user, or return the existing one.
 * Body: { userId: string }
 */
router.post('/dms', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      res.status(400).json({ error: 'Target user ID is required' });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ error: 'Cannot create a DM with yourself' });
      return;
    }

    // Check that target user exists
    const [targetUser] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if a DM channel already exists between these two users
    const currentUserDms = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, currentUserId));

    for (const { dmChannelId } of currentUserDms) {
      // Check if this is a 1:1 DM (not group) with the target user
      const [channel] = await db
        .select()
        .from(dmChannels)
        .where(and(eq(dmChannels.id, dmChannelId), eq(dmChannels.type, 'dm')))
        .limit(1);

      if (!channel) continue;

      const [targetParticipation] = await db
        .select()
        .from(dmParticipants)
        .where(and(eq(dmParticipants.dmChannelId, dmChannelId), eq(dmParticipants.userId, targetUserId)))
        .limit(1);

      if (targetParticipation) {
        // DM already exists, return it with participants
        const participants = await db
          .select({
            id: dmParticipants.userId,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            status: users.status,
            publicKey: users.publicKey,
          })
          .from(dmParticipants)
          .innerJoin(users, eq(dmParticipants.userId, users.id))
          .where(eq(dmParticipants.dmChannelId, dmChannelId));

        res.json({
          dmChannel: {
            id: channel.id,
            type: channel.type,
            createdAt: channel.createdAt,
            participants,
          },
          created: false,
        });
        return;
      }
    }

    // Create new DM channel - wrapped in transaction for atomicity
    const dmChannelId = uuidv4();
    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.insert(dmChannels).values({
        id: dmChannelId,
        type: 'dm',
        createdAt: now,
      }).run();

      tx.insert(dmParticipants).values([
        { dmChannelId, userId: currentUserId },
        { dmChannelId, userId: targetUserId },
      ]).run();
    });

    // Return with participant info
    const participants = await db
      .select({
        id: dmParticipants.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        publicKey: users.publicKey,
      })
      .from(dmParticipants)
      .innerJoin(users, eq(dmParticipants.userId, users.id))
      .where(eq(dmParticipants.dmChannelId, dmChannelId));

    res.status(201).json({
      dmChannel: {
        id: dmChannelId,
        type: 'dm',
        createdAt: now,
        participants,
      },
      created: true,
    });
  } catch (error) {
    console.error('Create DM error:', error);
    res.status(500).json({ error: 'Failed to create DM channel' });
  }
});

/**
 * POST /dms/group
 * Create a group DM channel.
 * Body: { userIds: string[] }
 */
router.post('/dms/group', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'At least one user ID is required' });
      return;
    }

    if (userIds.length > 9) {
      res.status(400).json({ error: 'Group DMs are limited to 10 participants' });
      return;
    }

    // Remove duplicates and self
    const uniqueUserIds = [...new Set(userIds.filter(id => id !== currentUserId))];

    if (uniqueUserIds.length === 0) {
      res.status(400).json({ error: 'Must include at least one other user' });
      return;
    }

    // Verify all users exist
    for (const uid of uniqueUserIds) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: `User ${uid} not found` });
        return;
      }
    }

    // Create group DM channel
    const dmChannelId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(dmChannels).values({
      id: dmChannelId,
      type: 'group_dm',
      createdAt: now,
    });

    // Add all participants including current user
    const allParticipants = [currentUserId, ...uniqueUserIds];
    await db.insert(dmParticipants).values(
      allParticipants.map(uid => ({ dmChannelId, userId: uid }))
    );

    // Return with participant info
    const participants = await db
      .select({
        id: dmParticipants.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        publicKey: users.publicKey,
      })
      .from(dmParticipants)
      .innerJoin(users, eq(dmParticipants.userId, users.id))
      .where(eq(dmParticipants.dmChannelId, dmChannelId));

    res.status(201).json({
      dmChannel: {
        id: dmChannelId,
        type: 'group_dm',
        createdAt: now,
        participants,
      },
    });
  } catch (error) {
    console.error('Create group DM error:', error);
    res.status(500).json({ error: 'Failed to create group DM' });
  }
});

export default router;
