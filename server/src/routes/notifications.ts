import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { pushSubscriptions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { VAPID_PUBLIC_KEY } from '../config';

const router = Router();

router.use(authMiddleware);

/**
 * GET /notifications/vapid-key
 * Get the VAPID public key for push subscription
 */
router.get('/vapid-key', (req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

/**
 * POST /notifications/subscribe
 * Subscribe to push notifications
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Invalid subscription data' });
      return;
    }

    // Check if this endpoint already exists
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing.length > 0) {
      res.json({ message: 'Already subscribed' });
      return;
    }

    await db.insert(pushSubscriptions).values({
      id: uuidv4(),
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Subscribed' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

/**
 * DELETE /notifications/unsubscribe
 * Unsubscribe from push notifications
 */
router.delete('/unsubscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { endpoint } = req.body;

    if (endpoint) {
      await db.delete(pushSubscriptions).where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
      );
    } else {
      // Delete all subscriptions for this user
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    }

    res.json({ message: 'Unsubscribed' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

export default router;
