import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { invites, servers, serverMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { hasPermission } from '../middleware/permissions';
import { generateInviteCode } from '../utils/invite';
import { Permissions } from '../config';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /servers/:serverId/invites
 * Create an invite for a server. Requires CREATE_INVITES permission.
 */
router.post('/servers/:serverId/invites', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;
    const { maxUses, expiresIn } = req.body;

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

    // Check permission
    const canInvite = await hasPermission(userId, serverId, Permissions.CREATE_INVITES);
    if (!canInvite) {
      res.status(403).json({ error: 'You do not have permission to create invites' });
      return;
    }

    const now = new Date().toISOString();
    let expiresAt: string | null = null;

    // Calculate expiration if provided (in seconds)
    if (expiresIn && typeof expiresIn === 'number' && expiresIn > 0) {
      const expirationDate = new Date(Date.now() + expiresIn * 1000);
      expiresAt = expirationDate.toISOString();
    }

    // Generate a unique invite code
    let code = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const [existing] = await db
        .select({ code: invites.code })
        .from(invites)
        .where(eq(invites.code, code))
        .limit(1);

      if (!existing) break;
      code = generateInviteCode();
      attempts++;
    }

    await db.insert(invites).values({
      code,
      serverId,
      creatorId: userId,
      uses: 0,
      maxUses: maxUses || 0,
      expiresAt,
      createdAt: now,
    });

    res.status(201).json({
      invite: {
        code,
        serverId,
        creatorId: userId,
        uses: 0,
        maxUses: maxUses || 0,
        expiresAt,
        createdAt: now,
      },
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

/**
 * GET /invites/:code
 * Get information about an invite (server name, member count, creator).
 */
router.get('/invites/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;

    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.code, code))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    // Check if expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      res.status(410).json({ error: 'Invite has expired' });
      return;
    }

    // Check max uses
    if (invite.maxUses && invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      res.status(410).json({ error: 'Invite has reached maximum uses' });
      return;
    }

    // Get server info
    const [server] = await db
      .select({
        id: servers.id,
        name: servers.name,
        iconUrl: servers.iconUrl,
      })
      .from(servers)
      .where(eq(servers.id, invite.serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Get member count
    const members = await db
      .select({ userId: serverMembers.userId })
      .from(serverMembers)
      .where(eq(serverMembers.serverId, invite.serverId));

    // Get creator info
    const [creator] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, invite.creatorId))
      .limit(1);

    res.json({
      invite: {
        code: invite.code,
        server: {
          id: server.id,
          name: server.name,
          iconUrl: server.iconUrl,
          memberCount: members.length,
        },
        creator: creator || null,
        expiresAt: invite.expiresAt,
        uses: invite.uses,
        maxUses: invite.maxUses,
      },
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to get invite info' });
  }
});

export default router;
