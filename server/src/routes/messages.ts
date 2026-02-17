import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { fetchLinkPreview } from '../utils/linkPreview';

const router = Router();

router.use(authMiddleware);

/**
 * POST /link-preview
 * Fetch Open Graph metadata for a URL.
 */
router.post('/link-preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    const preview = await fetchLinkPreview(url);

    if (!preview) {
      res.status(404).json({ error: 'No preview available' });
      return;
    }

    res.json({ preview });
  } catch (error) {
    console.error('Link preview error:', error);
    res.status(500).json({ error: 'Failed to fetch link preview' });
  }
});

export default router;
