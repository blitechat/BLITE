import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { users, prekeyBundles, oneTimePrekeys } from '../db/schema';
import { eq, or, count } from 'drizzle-orm';
import { signToken } from '../utils/jwt';
import { authMiddleware } from '../middleware/auth';
import { BCRYPT_ROUNDS } from '../config';
import { sendTelegram } from '../utils/telegram';
import { authLimiter, registerLimiter } from '../middleware/rateLimiter';
import { registerValidation, loginValidation } from '../middleware/validation';

const router = Router();

/**
 * POST /register
 * Create a new user account.
 */
router.post('/register', registerLimiter, registerValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, displayName, publicKey, phoneNumber, signingKey, keyBundle } = req.body;

    // Validate required fields
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-32 characters, alphanumeric and underscores only' });
      return;
    }

    // Validate email format (if provided)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password length
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    // Check if username already exists
    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUsername) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    // Check if email already exists (if provided)
    if (email) {
      const [existingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }
    }

    // Validate phone number format (optional)
    if (phoneNumber && !/^\+?[\d\s\-()]{7,20}$/.test(phoneNumber)) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create the user
    const userId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(users).values({
      id: userId,
      username,
      displayName: displayName || username,
      email: email || null,
      passwordHash,
      publicKey: publicKey || null,
      signingKey: signingKey || null,
      phoneNumber: phoneNumber || null,
      status: 'online',
      createdAt: now,
    });

    // Notify owner via Telegram
    const [{ count: totalUsers }] = await db.select({ count: count() }).from(users);
    const timeStr = new Date().toUTCString().replace(' GMT', ' UTC');
    await sendTelegram(
      `🎉 New user signed up\n\n<b>Username:</b> @${username}\n<b>Display name:</b> ${displayName || username}\n<b>Time:</b> ${timeStr}\n<b>Total users:</b> ${totalUsers}`
    );

    // If key bundle provided, store prekey bundle and OTPs
    if (keyBundle && keyBundle.identityKey && keyBundle.signedPreKey) {
      await db.insert(prekeyBundles).values({
        userId,
        identityKey: keyBundle.identityKey,
        signingKey: keyBundle.signingKey || signingKey || '',
        signedPreKey: keyBundle.signedPreKey,
        signedPreKeyId: keyBundle.signedPreKeyId || 1,
        signedPreKeySig: keyBundle.signedPreKeySig || '',
        updatedAt: now,
      });

      if (keyBundle.oneTimePreKeys && Array.isArray(keyBundle.oneTimePreKeys)) {
        for (const otp of keyBundle.oneTimePreKeys) {
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
    }

    // Generate JWT
    const token = signToken({ userId, username });

    // Return user data (without password hash)
    res.status(201).json({
      user: {
        id: userId,
        username,
        displayName: displayName || username,
        email: email || null,
        phoneNumber: phoneNumber || null,
        avatarUrl: null,
        publicKey: publicKey || null,
        signingKey: signingKey || null,
        status: 'online',
        customStatus: null,
        createdAt: now,
      },
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /login
 * Authenticate and get a JWT token.
 */
router.post('/login', authLimiter, loginValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    // Find user by email OR username
    const identifier = email.trim();
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.username, identifier)))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Update status to online
    await db
      .update(users)
      .set({ status: 'online' })
      .where(eq(users.id, user.id));

    // Generate JWT
    const token = signToken({ userId: user.id, username: user.username });

    // Return user data (without password hash)
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
        publicKey: user.publicKey,
        status: 'online',
        customStatus: user.customStatus,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /me
 * Get the currently authenticated user's profile.
 */
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

export default router;
