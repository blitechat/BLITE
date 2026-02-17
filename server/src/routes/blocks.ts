import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { blocks, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

/**
 * POST /blocks
 * Block a user.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const blockerId = req.user!.id;
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    if (blockerId === userId) {
      res.status(400).json({ error: 'You cannot block yourself' });
      return;
    }

    // Check if already blocked
    const [existing] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, userId)))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'User is already blocked' });
      return;
    }

    const now = new Date().toISOString();

    await db.insert(blocks).values({
      blockerId,
      blockedId: userId,
      createdAt: now,
    });

    res.status(201).json({ block: { blockerId, blockedId: userId, createdAt: now } });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

/**
 * DELETE /blocks/:userId
 * Unblock a user.
 */
router.delete('/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const blockerId = req.user!.id;
    const { userId } = req.params;

    await db.delete(blocks).where(
      and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, userId))
    );

    res.json({ message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

/**
 * GET /blocks
 * List all blocked users.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const blockerId = req.user!.id;

    const blockedUsers = await db
      .select({
        blockedId: blocks.blockedId,
        createdAt: blocks.createdAt,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(blocks)
      .innerJoin(users, eq(blocks.blockedId, users.id))
      .where(eq(blocks.blockerId, blockerId));

    const formatted = blockedUsers.map(b => ({
      blockerId,
      blockedId: b.blockedId,
      createdAt: b.createdAt,
      user: {
        id: b.blockedId,
        username: b.username,
        displayName: b.displayName,
        avatarUrl: b.avatarUrl,
      },
    }));

    res.json({ blocks: formatted });
  } catch (error) {
    console.error('List blocks error:', error);
    res.status(500).json({ error: 'Failed to list blocks' });
  }
});

export default router;
