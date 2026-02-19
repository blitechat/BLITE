import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Registration limiter (uncapped — self-hosted instances control their own signups)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 0, // 0 = unlimited
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload limiter
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 uploads per 15 minutes
  message: 'Too many upload requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Message creation limiter (prevent spam)
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 messages per minute
  message: 'Sending messages too quickly, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});
