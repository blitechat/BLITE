import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { users } from '../db/schema';
import { eq, like } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /users/search?q=
 * Search users by username (partial match).
 * This must be defined BEFORE /users/:userId to avoid route conflicts.
 */
router.get('/users/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    if (query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const results = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
      })
      .from(users)
      .where(like(users.username, `%${query}%`))
      .limit(20);

    res.json({ users: results });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

/**
 * PUT /users/me
 * Update the authenticated user's own profile.
 */
router.put('/users/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { displayName, avatarUrl, customStatus, publicKey, phoneNumber, bio, bannerUrl } = req.body;

    const updates: Partial<{
      displayName: string;
      avatarUrl: string | null;
      customStatus: string | null;
      publicKey: string | null;
      phoneNumber: string | null;
      bio: string | null;
      bannerUrl: string | null;
    }> = {};

    if (displayName !== undefined) {
      if (!displayName || displayName.trim().length === 0) {
        res.status(400).json({ error: 'Display name cannot be empty' });
        return;
      }
      if (displayName.length > 32) {
        res.status(400).json({ error: 'Display name must be 32 characters or less' });
        return;
      }
      updates.displayName = displayName.trim();
    }
    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl;
    }
    if (customStatus !== undefined) {
      updates.customStatus = customStatus;
    }
    if (publicKey !== undefined) {
      updates.publicKey = publicKey;
    }
    if (phoneNumber !== undefined) {
      if (phoneNumber && !/^\+?[\d\s\-()]{7,20}$/.test(phoneNumber)) {
        res.status(400).json({ error: 'Invalid phone number format' });
        return;
      }
      updates.phoneNumber = phoneNumber || null;
    }
    if (bio !== undefined) {
      if (bio && bio.length > 500) {
        res.status(400).json({ error: 'Bio must be 500 characters or less' });
        return;
      }
      updates.bio = bio || null;
    }
    if (bannerUrl !== undefined) {
      updates.bannerUrl = bannerUrl || null;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId));

    const [updatedUser] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        avatarUrl: users.avatarUrl,
        publicKey: users.publicKey,
        bio: users.bio,
        bannerUrl: users.bannerUrl,
        status: users.status,
        customStatus: users.customStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /users/:userId
 * Get a user's public profile.
 */
router.get('/users/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        phoneNumber: users.phoneNumber,
        avatarUrl: users.avatarUrl,
        publicKey: users.publicKey,
        bio: users.bio,
        bannerUrl: users.bannerUrl,
        status: users.status,
        customStatus: users.customStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * GET /users/:userId/key
 * Get a user's public key for E2EE.
 */
router.get('/users/:userId/key', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        publicKey: users.publicKey,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.publicKey) {
      res.status(404).json({ error: 'User has not published a public key' });
      return;
    }

    res.json({ userId: user.id, username: user.username, publicKey: user.publicKey });
  } catch (error) {
    console.error('Get user key error:', error);
    res.status(500).json({ error: 'Failed to get user key' });
  }
});

export default router;
