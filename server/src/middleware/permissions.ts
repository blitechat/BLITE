import { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { serverMembers, roles, servers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { Permissions, ADMIN_PERMISSIONS } from '../config';

/**
 * Get the effective permissions for a user in a server.
 * Returns the permission bitfield combining the user's role permissions.
 * Server owners automatically get all permissions.
 * Optimized to use a single JOIN query instead of 4 sequential queries.
 */
export async function getUserPermissions(userId: string, serverId: string): Promise<number> {
  // Single query to get all permission data
  const [result] = await db
    .select({
      ownerId: servers.ownerId,
      roleId: serverMembers.roleId,
      rolePermissions: roles.permissions,
    })
    .from(serverMembers)
    .innerJoin(servers, eq(serverMembers.serverId, servers.id))
    .leftJoin(roles, eq(serverMembers.roleId, roles.id))
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);

  // User is not a member
  if (!result) {
    return 0;
  }

  // Server owner gets all permissions
  if (result.ownerId === userId) {
    return ADMIN_PERMISSIONS;
  }

  // User has a specific role
  if (result.rolePermissions !== null) {
    // If role has ADMIN bit, grant all permissions
    if (result.rolePermissions & Permissions.ADMIN) {
      return ADMIN_PERMISSIONS;
    }
    return result.rolePermissions;
  }

  // Fallback to @everyone role (position 0) in a separate query
  // This is only hit if user has no role assigned, which is rare
  const [everyoneRole] = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(and(eq(roles.serverId, serverId), eq(roles.position, 0)))
    .limit(1);

  return everyoneRole ? everyoneRole.permissions : 0;
}

/**
 * Express middleware factory that checks if the authenticated user
 * has the required permission bits for the server specified in req.params.serverId.
 */
export function requirePermission(...requiredPermissions: number[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const serverId = req.params.serverId;

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!serverId) {
        res.status(400).json({ error: 'Server ID is required' });
        return;
      }

      const userPermissions = await getUserPermissions(userId, serverId);

      // Check each required permission
      const combinedRequired = requiredPermissions.reduce((acc, p) => acc | p, 0);
      if ((userPermissions & combinedRequired) !== combinedRequired) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Check permissions for a user (non-middleware version for socket handlers).
 * Returns true if the user has all the required permissions.
 */
export async function hasPermission(userId: string, serverId: string, ...requiredPermissions: number[]): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId, serverId);
  const combinedRequired = requiredPermissions.reduce((acc, p) => acc | p, 0);
  return (userPermissions & combinedRequired) === combinedRequired;
}
