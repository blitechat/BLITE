import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { prekeyBundles, oneTimePrekeys, recoveryKeys } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /bundle
 * Upload or update a full key bundle (identity, signing, signedPreKey, OTPs)
 */
router.post('/bundle', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { identityKey, signingKey, signedPreKey, signedPreKeyId, signedPreKeySig, oneTimePreKeys } = req.body;

    if (!identityKey || !signingKey || !signedPreKey || signedPreKeyId == null || !signedPreKeySig) {
      res.status(400).json({ error: 'Missing required key bundle fields' });
      return;
    }

    const now = new Date().toISOString();

    // Upsert prekey bundle
    const [existing] = await db
      .select({ userId: prekeyBundles.userId })
      .from(prekeyBundles)
      .where(eq(prekeyBundles.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(prekeyBundles)
        .set({
          identityKey,
          signingKey,
          signedPreKey,
          signedPreKeyId,
          signedPreKeySig,
          updatedAt: now,
        })
        .where(eq(prekeyBundles.userId, userId));
    } else {
      await db.insert(prekeyBundles).values({
        userId,
        identityKey,
        signingKey,
        signedPreKey,
        signedPreKeyId,
        signedPreKeySig,
        updatedAt: now,
      });
    }

    // Insert one-time prekeys if provided
    if (oneTimePreKeys && Array.isArray(oneTimePreKeys)) {
      for (const otp of oneTimePreKeys) {
        if (otp.keyId != null && otp.publicKey) {
          await db.insert(oneTimePrekeys).values({
            userId,
            keyId: otp.keyId,
            publicKey: otp.publicKey,
            createdAt: now,
          });
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Upload key bundle error:', error);
    res.status(500).json({ error: 'Failed to upload key bundle' });
  }
});

/**
 * GET /bundle/:userId
 * Fetch a user's key bundle for X3DH (consumes one OTP atomically)
 */
router.get('/bundle/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = req.params.userId;

    // Get the prekey bundle
    const [bundle] = await db
      .select()
      .from(prekeyBundles)
      .where(eq(prekeyBundles.userId, targetUserId))
      .limit(1);

    if (!bundle) {
      res.status(404).json({ error: 'Key bundle not found for user' });
      return;
    }

    // Try to consume one OTP atomically
    const [otp] = await db
      .select()
      .from(oneTimePrekeys)
      .where(eq(oneTimePrekeys.userId, targetUserId))
      .limit(1);

    let oneTimePreKey: string | undefined;
    let oneTimePreKeyId: number | undefined;

    if (otp) {
      oneTimePreKey = otp.publicKey;
      oneTimePreKeyId = otp.keyId;
      // Delete the consumed OTP
      await db.delete(oneTimePrekeys).where(eq(oneTimePrekeys.id, otp.id));
    }

    res.json({
      identityKey: bundle.identityKey,
      signingKey: bundle.signingKey,
      signedPreKey: bundle.signedPreKey,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeySig: bundle.signedPreKeySig,
      oneTimePreKey,
      oneTimePreKeyId,
    });
  } catch (error) {
    console.error('Fetch key bundle error:', error);
    res.status(500).json({ error: 'Failed to fetch key bundle' });
  }
});

/**
 * POST /prekeys
 * Upload more one-time prekeys
 */
router.post('/prekeys', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { prekeys } = req.body;

    if (!prekeys || !Array.isArray(prekeys)) {
      res.status(400).json({ error: 'prekeys array is required' });
      return;
    }

    const now = new Date().toISOString();

    for (const pk of prekeys) {
      if (pk.keyId != null && pk.publicKey) {
        await db.insert(oneTimePrekeys).values({
          userId,
          keyId: pk.keyId,
          publicKey: pk.publicKey,
          createdAt: now,
        });
      }
    }

    res.json({ success: true, count: prekeys.length });
  } catch (error) {
    console.error('Upload prekeys error:', error);
    res.status(500).json({ error: 'Failed to upload prekeys' });
  }
});

/**
 * GET /prekeys/count
 * Check how many OTPs remain for the authenticated user
 */
router.get('/prekeys/count', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(oneTimePrekeys)
      .where(eq(oneTimePrekeys.userId, userId));

    res.json({ count: result[0]?.count || 0 });
  } catch (error) {
    console.error('Get prekey count error:', error);
    res.status(500).json({ error: 'Failed to get prekey count' });
  }
});

/**
 * POST /recovery
 * Store an encrypted recovery blob
 */
router.post('/recovery', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { encrypted, nonce, salt, iterations } = req.body;

    if (!encrypted || !nonce) {
      res.status(400).json({ error: 'encrypted and nonce are required' });
      return;
    }

    const now = new Date().toISOString();

    // Upsert recovery key
    const [existing] = await db
      .select({ userId: recoveryKeys.userId })
      .from(recoveryKeys)
      .where(eq(recoveryKeys.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(recoveryKeys)
        .set({ encryptedBlob: encrypted, nonce, salt: salt ?? null, iterations: iterations ?? null, updatedAt: now })
        .where(eq(recoveryKeys.userId, userId));
    } else {
      await db.insert(recoveryKeys).values({
        userId,
        encryptedBlob: encrypted,
        nonce,
        salt: salt ?? null,
        iterations: iterations ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Store recovery error:', error);
    res.status(500).json({ error: 'Failed to store recovery data' });
  }
});

/**
 * GET /recovery
 * Fetch recovery blob for authenticated user
 */
router.get('/recovery', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [recovery] = await db
      .select()
      .from(recoveryKeys)
      .where(eq(recoveryKeys.userId, userId))
      .limit(1);

    if (!recovery) {
      res.status(404).json({ error: 'No recovery data found' });
      return;
    }

    res.json({
      encrypted: recovery.encryptedBlob,
      nonce: recovery.nonce,
      ...(recovery.salt != null && { salt: recovery.salt }),
      ...(recovery.iterations != null && { iterations: recovery.iterations }),
    });
  } catch (error) {
    console.error('Fetch recovery error:', error);
    res.status(500).json({ error: 'Failed to fetch recovery data' });
  }
});

export default router;
