import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { db } from '../db/connection';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        displayName: string;
        email: string;
        phoneNumber: string | null;
        avatarUrl: string | null;
        publicKey: string | null;
        signingKey: string | null;
        status: string;
        customStatus: string | null;
      };
    }
  }
}

// Extend Socket to include user
export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    username: string;
    displayName: string;
    publicKey: string | null;
  };
}

/**
 * Extract the bearer token from the Authorization header.
 */
function extractToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Express middleware that validates JWT and attaches user to req.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        avatarUrl: users.avatarUrl,
        publicKey: users.publicKey,
        signingKey: users.signingKey,
        status: users.status,
        customStatus: users.customStatus,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Socket.IO middleware that validates JWT from handshake auth and attaches user.
 */
export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    const token = socket.handshake.auth?.token || extractToken(socket.handshake.headers?.authorization);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    // Properly await the database query
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        publicKey: users.publicKey,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return next(new Error('User not found'));
    }

    (socket as AuthenticatedSocket).user = user;
    next();
  } catch (error) {
    console.error('[Auth] Socket authentication error:', error);
    next(new Error('Authentication error'));
  }
}
