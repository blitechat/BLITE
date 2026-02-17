import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { auditLogs } from '../db/schema';

export async function createAuditLog(
  serverId: string,
  userId: string,
  action: string,
  targetId?: string | null,
  targetType?: string | null,
  metadata?: Record<string, any> | null
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: uuidv4(),
      serverId,
      userId,
      action,
      targetId: targetId || null,
      targetType: targetType || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[AuditLog] Failed to create audit log:', err);
  }
}
