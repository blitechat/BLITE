import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { roles, serverMembers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { getUserPermissions } from '../middleware/permissions';
import { Permissions } from '../config';
import { createAuditLog } from '../utils/auditLog';

const router = Router();

router.use(authMiddleware);

/**
 * POST /servers/:serverId/roles
 * Create a new role in a server. Requires MANAGE_ROLES permission.
 */
router.post('/servers/:serverId/roles', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { serverId } = req.params;
    const { name, color, permissions } = req.body;

    const perms = await getUserPermissions(userId, serverId);
    if (!(perms & Permissions.MANAGE_ROLES) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Role name is required' });
      return;
    }

    // Get max position
    const existingRoles = await db
      .select({ position: roles.position })
      .from(roles)
      .where(eq(roles.serverId, serverId));

    const maxPos = existingRoles.reduce((max, r) => Math.max(max, r.position), 0);

    const roleId = uuidv4();
    await db.insert(roles).values({
      id: roleId,
      serverId,
      name: name.trim(),
      color: color || '#99aab5',
      permissions: permissions || 0,
      position: maxPos + 1,
    });

    const [newRole] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

    await createAuditLog(serverId, userId, 'ROLE_CREATE', roleId, 'role', { name: name.trim() });

    res.status(201).json(newRole);
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * PUT /roles/:roleId
 * Update a role. Requires MANAGE_ROLES permission.
 */
router.put('/roles/:roleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { roleId } = req.params;
    const { name, color, permissions, position } = req.body;

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const perms = await getUserPermissions(userId, role.serverId);
    if (!(perms & Permissions.MANAGE_ROLES) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const updates: Partial<{ name: string; color: string; permissions: number; position: number }> = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (permissions !== undefined) updates.permissions = permissions;
    if (position !== undefined) updates.position = position;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await db.update(roles).set(updates).where(eq(roles.id, roleId));

    const [updatedRole] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

    await createAuditLog(role.serverId, userId, 'ROLE_UPDATE', roleId, 'role', updates);

    res.json(updatedRole);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /roles/:roleId
 * Delete a role. Requires MANAGE_ROLES permission.
 */
router.delete('/roles/:roleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { roleId } = req.params;

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const perms = await getUserPermissions(userId, role.serverId);
    if (!(perms & Permissions.MANAGE_ROLES) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Remove role from members who have it
    await db.update(serverMembers)
      .set({ roleId: null })
      .where(and(eq(serverMembers.serverId, role.serverId), eq(serverMembers.roleId, roleId)));

    await db.delete(roles).where(eq(roles.id, roleId));

    await createAuditLog(role.serverId, userId, 'ROLE_DELETE', roleId, 'role', { name: role.name });

    res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

/**
 * POST /servers/:serverId/members/:userId/role
 * Assign a role to a member. Requires MANAGE_ROLES permission.
 */
router.post('/servers/:serverId/members/:userId/role', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const { serverId, userId } = req.params;
    const { roleId } = req.body;

    const perms = await getUserPermissions(currentUserId, serverId);
    if (!(perms & Permissions.MANAGE_ROLES) && !(perms & Permissions.ADMIN)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Verify the role belongs to this server if roleId is provided
    if (roleId) {
      const [role] = await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.serverId, serverId))).limit(1);
      if (!role) {
        res.status(404).json({ error: 'Role not found in this server' });
        return;
      }
    }

    await db.update(serverMembers)
      .set({ roleId: roleId || null })
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));

    await createAuditLog(serverId, currentUserId, 'ROLE_ASSIGN', userId, 'user', { roleId });

    res.json({ message: 'Role assigned' });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

export default router;
