import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { servers, serverMembers, channels, roles, users, invites, bans, auditLogs } from '../db/schema';
import { eq, and, like, or, sql, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { ADMIN_PERMISSIONS, DEFAULT_PERMISSIONS, Permissions } from '../config';
import { getUserPermissions } from '../middleware/permissions';
import { getIO } from '../socket/io';
import { createAuditLog } from '../utils/auditLog';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /
 * List all servers the authenticated user is a member of.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const memberServers = await db
      .select({
        id: servers.id,
        name: servers.name,
        iconUrl: servers.iconUrl,
        ownerId: servers.ownerId,
        createdAt: servers.createdAt,
      })
      .from(serverMembers)
      .innerJoin(servers, eq(serverMembers.serverId, servers.id))
      .where(eq(serverMembers.userId, userId));

    res.json(memberServers);
  } catch (error) {
    console.error('List servers error:', error);
    res.status(500).json({ error: 'Failed to list servers' });
  }
});

/**
 * POST /
 * Create a new server. Automatically creates a default "general" text channel,
 * an admin role, a default @everyone role, and adds the creator as owner.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, iconUrl } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Server name is required' });
      return;
    }

    if (name.length > 100) {
      res.status(400).json({ error: 'Server name must be 100 characters or less' });
      return;
    }

    const now = new Date().toISOString();
    const serverId = uuidv4();
    const textChannelId = uuidv4();
    const voiceChannelId = uuidv4();
    const adminRoleId = uuidv4();
    const everyoneRoleId = uuidv4();

    // Wrap all operations in a transaction to ensure atomicity
    // Note: better-sqlite3 transactions are synchronous — do not use async/await
    db.transaction((tx) => {
      tx.insert(servers).values({
        id: serverId,
        name: name.trim(),
        iconUrl: iconUrl || null,
        ownerId: userId,
        createdAt: now,
      }).run();

      tx.insert(roles).values({
        id: everyoneRoleId,
        serverId,
        name: '@everyone',
        color: '#99aab5',
        permissions: DEFAULT_PERMISSIONS,
        position: 0,
      }).run();

      tx.insert(roles).values({
        id: adminRoleId,
        serverId,
        name: 'Admin',
        color: '#e74c3c',
        permissions: ADMIN_PERMISSIONS,
        position: 1,
      }).run();

      tx.insert(serverMembers).values({
        serverId,
        userId,
        roleId: adminRoleId,
        joinedAt: now,
      }).run();

      tx.insert(channels).values({
        id: textChannelId,
        serverId,
        name: 'general',
        type: 'text',
        position: 0,
        createdAt: now,
      }).run();

      tx.insert(channels).values({
        id: voiceChannelId,
        serverId,
        name: 'General',
        type: 'voice',
        position: 1,
        createdAt: now,
      }).run();
    });

    res.status(201).json({
      server: {
        id: serverId,
        name: name.trim(),
        iconUrl: iconUrl || null,
        ownerId: userId,
        createdAt: now,
      },
      channel: {
        id: textChannelId,
        serverId,
        name: 'general',
        type: 'text',
        categoryId: null,
        position: 0,
        createdAt: now,
      },
    });
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

/**
 * GET /:serverId
 * Get server details. User must be a member.
 */
router.get('/:serverId', async (req: Request, res: Response): Promise<void> => {
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

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Get server roles
    const serverRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId));

    res.json({ server, roles: serverRoles });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Failed to get server' });
  }
});

/**
 * PUT /:serverId
 * Update server details. Owner only.
 */
router.put('/:serverId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;
    const { name, iconUrl } = req.body;

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    if (server.ownerId !== userId) {
      res.status(403).json({ error: 'Only the server owner can update server settings' });
      return;
    }

    const updates: Partial<{ name: string; iconUrl: string | null }> = {};
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Server name cannot be empty' });
        return;
      }
      updates.name = name.trim();
    }
    if (iconUrl !== undefined) {
      updates.iconUrl = iconUrl;
    }

    await db
      .update(servers)
      .set(updates)
      .where(eq(servers.id, serverId));

    const [updatedServer] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    await createAuditLog(serverId, userId, 'SERVER_UPDATE', serverId, 'server', updates);

    res.json({ server: updatedServer });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Failed to update server' });
  }
});

/**
 * DELETE /:serverId
 * Delete a server. Owner only. Cascades to channels, members, roles, invites.
 */
router.delete('/:serverId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    if (server.ownerId !== userId) {
      res.status(403).json({ error: 'Only the server owner can delete the server' });
      return;
    }

    // Delete in order (cascade should handle most, but be explicit) - wrapped in transaction
    db.transaction((tx) => {
      tx.delete(invites).where(eq(invites.serverId, serverId)).run();
      tx.delete(serverMembers).where(eq(serverMembers.serverId, serverId)).run();
      tx.delete(roles).where(eq(roles.serverId, serverId)).run();
      tx.delete(channels).where(eq(channels.serverId, serverId)).run();
      tx.delete(servers).where(eq(servers.id, serverId)).run();
    });

    res.json({ message: 'Server deleted' });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

/**
 * POST /join
 * Join a server via invite code.
 */
router.post('/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    // Find the invite
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.code, code))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    // Check if invite is expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      res.status(410).json({ error: 'Invite has expired' });
      return;
    }

    // Check if invite has max uses reached
    if (invite.maxUses && invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      res.status(410).json({ error: 'Invite has reached maximum uses' });
      return;
    }

    // Check if user is banned
    const [existingBan] = await db
      .select()
      .from(bans)
      .where(and(eq(bans.serverId, invite.serverId), eq(bans.userId, userId)))
      .limit(1);

    if (existingBan) {
      res.status(403).json({ error: 'You are banned from this server' });
      return;
    }

    // Check if already a member
    const [existingMembership] = await db
      .select()
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, invite.serverId), eq(serverMembers.userId, userId)))
      .limit(1);

    if (existingMembership) {
      res.status(409).json({ error: 'You are already a member of this server' });
      return;
    }

    const now = new Date().toISOString();

    // Add user as a member (no specific role, uses @everyone)
    await db.insert(serverMembers).values({
      serverId: invite.serverId,
      userId,
      joinedAt: now,
    });

    // Increment invite uses
    await db
      .update(invites)
      .set({ uses: invite.uses + 1 })
      .where(eq(invites.code, code));

    // Get the server details
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, invite.serverId))
      .limit(1);

    // Emit member:needs-keys so existing members distribute sender keys
    try {
      const io = getIO();
      io.to(`server:${invite.serverId}`).emit('member:needs-keys', {
        serverId: invite.serverId,
        userId,
      });
    } catch {
      // Socket not initialized yet, skip
    }

    res.json({ server });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ error: 'Failed to join server' });
  }
});

/**
 * POST /:serverId/leave
 * Leave a server. Owner cannot leave (must transfer or delete).
 */
router.post('/:serverId/leave', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    if (server.ownerId === userId) {
      res.status(400).json({ error: 'Server owner cannot leave. Transfer ownership or delete the server.' });
      return;
    }

    const [membership] = await db
      .select()
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      res.status(404).json({ error: 'You are not a member of this server' });
      return;
    }

    await db
      .delete(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));

    res.json({ message: 'Left server' });
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({ error: 'Failed to leave server' });
  }
});

/**
 * GET /:serverId/roles
 * List all roles for a server.
 */
router.get('/:serverId/roles', async (req: Request, res: Response): Promise<void> => {
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

    // Get server roles
    const serverRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId));

    res.json(serverRoles);
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

/**
 * GET /:serverId/members
 * List members of a server with pagination and search support.
 * Query params: ?page=1&limit=50&search=username
 */
router.get('/:serverId/members', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const search = (req.query.search as string || '').trim();
    const offset = (page - 1) * limit;

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

    // Build where conditions
    let whereConditions = eq(serverMembers.serverId, serverId);
    if (search) {
      whereConditions = and(
        whereConditions,
        or(
          like(users.username, `%${search}%`),
          like(users.displayName, `%${search}%`)
        )
      ) as any;
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(serverMembers)
      .innerJoin(users, eq(serverMembers.userId, users.id))
      .where(whereConditions);

    const totalCount = countResult?.count || 0;

    // Get paginated members with user and role info
    const members = await db
      .select({
        userId: serverMembers.userId,
        nickname: serverMembers.nickname,
        joinedAt: serverMembers.joinedAt,
        roleId: serverMembers.roleId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        customStatus: users.customStatus,
        publicKey: users.publicKey,
      })
      .from(serverMembers)
      .innerJoin(users, eq(serverMembers.userId, users.id))
      .where(whereConditions)
      .limit(limit)
      .offset(offset);

    // Get roles for this server to attach full role info
    const serverRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId));

    const rolesMap = new Map(serverRoles.map(r => [r.id, r]));

    const enrichedMembers = members.map(m => ({
      serverId,
      userId: m.userId,
      roleId: m.roleId,
      nickname: m.nickname,
      joinedAt: m.joinedAt,
      user: {
        id: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        status: m.status,
        customStatus: m.customStatus,
        publicKey: m.publicKey || '',
      },
      role: m.roleId ? rolesMap.get(m.roleId) || null : null,
    }));

    res.json({
      members: enrichedMembers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + members.length < totalCount,
      },
    });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * DELETE /:serverId/members/:userId
 * Kick a member from a server. Requires KICK_MEMBERS permission.
 */
router.delete('/:serverId/members/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId, userId } = req.params;

    // Can't kick yourself
    if (currentUserId === userId) {
      res.status(400).json({ error: 'You cannot kick yourself' });
      return;
    }

    // Check permissions
    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.KICK_MEMBERS) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Can't kick the server owner
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (server && server.ownerId === userId) {
      res.status(403).json({ error: 'Cannot kick the server owner' });
      return;
    }

    await db.delete(serverMembers).where(
      and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId))
    );

    await createAuditLog(serverId, currentUserId, 'MEMBER_KICK', userId, 'user');

    res.json({ message: 'Member kicked' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

/**
 * POST /:serverId/bans
 * Ban a member from a server. Requires BAN_MEMBERS permission.
 */
router.post('/:serverId/bans', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId } = req.params;
    const { userId, reason } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    if (currentUserId === userId) {
      res.status(400).json({ error: 'You cannot ban yourself' });
      return;
    }

    // Check permissions
    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.BAN_MEMBERS) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Can't ban the server owner
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (server && server.ownerId === userId) {
      res.status(403).json({ error: 'Cannot ban the server owner' });
      return;
    }

    // Check if already banned
    const [existing] = await db
      .select()
      .from(bans)
      .where(and(eq(bans.serverId, serverId), eq(bans.userId, userId)))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'User is already banned' });
      return;
    }

    const banId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(bans).values({
      id: banId,
      serverId,
      userId,
      bannedBy: currentUserId,
      reason: reason || null,
      createdAt: now,
    });

    // Also remove from server members
    await db.delete(serverMembers).where(
      and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId))
    );

    await createAuditLog(serverId, currentUserId, 'MEMBER_BAN', userId, 'user', { reason });

    res.status(201).json({ ban: { id: banId, serverId, userId, bannedBy: currentUserId, reason, createdAt: now } });
  } catch (error) {
    console.error('Ban member error:', error);
    res.status(500).json({ error: 'Failed to ban member' });
  }
});

/**
 * DELETE /:serverId/bans/:userId
 * Unban a user from a server. Requires BAN_MEMBERS permission.
 */
router.delete('/:serverId/bans/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId, userId } = req.params;

    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.BAN_MEMBERS) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    await db.delete(bans).where(and(eq(bans.serverId, serverId), eq(bans.userId, userId)));

    await createAuditLog(serverId, currentUserId, 'MEMBER_UNBAN', userId, 'user');

    res.json({ message: 'User unbanned' });
  } catch (error) {
    console.error('Unban member error:', error);
    res.status(500).json({ error: 'Failed to unban member' });
  }
});

/**
 * GET /:serverId/bans
 * List all bans for a server. Requires BAN_MEMBERS permission.
 */
router.get('/:serverId/bans', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId } = req.params;

    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.BAN_MEMBERS) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const serverBans = await db
      .select({
        id: bans.id,
        serverId: bans.serverId,
        userId: bans.userId,
        bannedBy: bans.bannedBy,
        reason: bans.reason,
        createdAt: bans.createdAt,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(bans)
      .innerJoin(users, eq(bans.userId, users.id))
      .where(eq(bans.serverId, serverId));

    const formatted = serverBans.map(b => ({
      id: b.id,
      serverId: b.serverId,
      userId: b.userId,
      bannedBy: b.bannedBy,
      reason: b.reason,
      createdAt: b.createdAt,
      user: {
        id: b.userId,
        username: b.username,
        displayName: b.displayName,
        avatarUrl: b.avatarUrl,
      },
    }));

    res.json({ bans: formatted });
  } catch (error) {
    console.error('List bans error:', error);
    res.status(500).json({ error: 'Failed to list bans' });
  }
});

/**
 * GET /:serverId/audit-log
 * Get audit logs for a server. Requires ADMIN permission.
 * Query params: ?page=1&limit=50&action=MEMBER_KICK
 */
router.get('/:serverId/audit-log', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const actionFilter = req.query.action as string | undefined;
    const offset = (page - 1) * limit;

    // Check ADMIN permission
    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }

    // Build where conditions
    let whereConditions: any = eq(auditLogs.serverId, serverId);
    if (actionFilter) {
      whereConditions = and(whereConditions, eq(auditLogs.action, actionFilter));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereConditions);

    const totalCount = countResult?.count || 0;

    // Get paginated logs with user info
    const logs = await db
      .select({
        id: auditLogs.id,
        serverId: auditLogs.serverId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        targetId: auditLogs.targetId,
        targetType: auditLogs.targetType,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.userId, users.id))
      .where(whereConditions)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = logs.map(log => ({
      id: log.id,
      serverId: log.serverId,
      userId: log.userId,
      action: log.action,
      targetId: log.targetId,
      targetType: log.targetType,
      metadata: log.metadata,
      createdAt: log.createdAt,
      user: {
        id: log.userId,
        username: log.username,
        displayName: log.displayName,
        avatarUrl: log.avatarUrl,
      },
    }));

    res.json({
      logs: enriched,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + logs.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

export default router;
