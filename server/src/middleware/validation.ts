import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import validator from 'validator';

// Pre-compiled regex patterns for validation (performance optimization)
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|fe80:|fc00:|fd)/;
const INTERNAL_TLDS = ['.local', '.internal', '.private', '.corp', '.home', '.lan'];
const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '0000:0000:0000:0000:0000:0000:0000:0001']);

// Middleware to check validation results
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return the first error message for better UX
    const firstError = errors.array()[0];
    console.error('[Validation] Failed:', errors.array());
    res.status(400).json({
      error: firstError.msg || 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

// Auth validation rules
export const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 32 })
    .withMessage('Username must be 3-32 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('displayName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be 1-50 characters'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('publicKey')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Public key must not be empty if provided'),
  body('signingKey')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Signing key must not be empty if provided'),
  body('phoneNumber')
    .optional()
    .trim(),
  validate,
];

export const loginValidation = [
  body('email').trim().notEmpty().withMessage('Username or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

// Server validation rules
export const createServerValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Server name must be 1-100 characters'),
  validate,
];

// Channel validation rules
export const createChannelValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Channel name must be 1-100 characters')
    .matches(/^[a-z0-9-_]+$/)
    .withMessage('Channel name can only contain lowercase letters, numbers, hyphens, and underscores'),
  body('type').isIn(['text', 'voice', 'category']).withMessage('Invalid channel type'),
  validate,
];

// Message validation rules
export const sendMessageValidation = [
  body('channelId').trim().notEmpty().withMessage('Channel ID is required'),
  body('encryptedContent')
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 10000 })
    .withMessage('Message is too long'),
  validate,
];

// URL validation for link previews (SSRF protection)
export const validateURL = (url: string): boolean => {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Block localhost, private IPs, and internal networks
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variations (using pre-compiled Set for fast lookup)
    if (LOCALHOST_NAMES.has(hostname) || hostname.startsWith('127.')) {
      return false;
    }

    // Block private IP ranges (using pre-compiled regex)
    if (PRIVATE_IP_REGEX.test(hostname)) {
      return false;
    }

    // Block internal TLDs (using pre-compiled array)
    if (INTERNAL_TLDS.some(tld => hostname.endsWith(tld))) {
      return false;
    }

    return validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    });
  } catch {
    return false;
  }
};

// ID validation
export const uuidValidation = (field: 'param' | 'body' | 'query', name: string) => {
  const validator = field === 'param' ? param(name) : field === 'body' ? body(name) : query(name);
  return validator
    .trim()
    .notEmpty()
    .withMessage(`${name} is required`)
    .isLength({ min: 36, max: 36 })
    .withMessage(`Invalid ${name} format`);
};
