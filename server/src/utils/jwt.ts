import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config';

export interface JwtPayload {
  userId: string;
  username: string;
}

/**
 * Sign a JWT token for a user.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token. Returns the decoded payload or null if invalid.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & jwt.JwtPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
