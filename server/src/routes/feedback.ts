import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { feedback } from '../db/schema';
import { desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { sendTelegram } from '../utils/telegram';

const router = Router();

router.use(authMiddleware);

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  general: 'General Feedback',
};

/**
 * POST /api/feedback
 * Submit a feedback entry
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, subject, description } = req.body;
    const user = req.user!;

    if (!type || !['bug', 'feature', 'general'].includes(type)) {
      res.status(400).json({ error: 'Invalid type. Must be bug, feature, or general.' });
      return;
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      res.status(400).json({ error: 'Subject is required.' });
      return;
    }
    if (subject.length > 100) {
      res.status(400).json({ error: 'Subject must be 100 characters or fewer.' });
      return;
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({ error: 'Description is required.' });
      return;
    }
    if (description.length > 1000) {
      res.status(400).json({ error: 'Description must be 1000 characters or fewer.' });
      return;
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    await db.insert(feedback).values({
      id,
      userId: user.id,
      username: user.username,
      type,
      subject: subject.trim(),
      description: description.trim(),
      createdAt,
    });

    const typeLabel = TYPE_LABELS[type] || type;
    const telegramMessage = `🔔 New ${typeLabel} from @${user.username}\n\n<b>Subject:</b> ${subject.trim()}\n\n${description.trim()}`;
    await sendTelegram(telegramMessage);

    res.status(201).json({ message: 'Feedback submitted. Thank you!' });
  } catch (err) {
    console.error('[Feedback] POST error:', err);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

/**
 * GET /api/feedback
 * List all feedback submissions (owner-facing)
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(feedback).orderBy(desc(feedback.createdAt));
    res.json({ feedback: rows });
  } catch (err) {
    console.error('[Feedback] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

export default router;
