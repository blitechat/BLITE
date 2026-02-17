import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { UPLOAD_DIR, MAX_FILE_SIZE } from '../config';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Create date-based subdirectory for organization
    const dateDir = new Date().toISOString().split('T')[0];
    const uploadPath = path.join(UPLOAD_DIR, dateDir);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    // Generate a unique filename preserving the original extension
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter to block potentially dangerous file types
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const blockedExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (blockedExtensions.includes(ext)) {
    cb(new Error(`File type ${ext} is not allowed`));
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /upload
 * Upload a file. Returns the URL to access it.
 */
router.post('/upload', uploadLimiter, upload.single('file'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    // Validate file type (skip for client-encrypted .enc files)
    const isEncrypted = req.file.originalname.endsWith('.enc');
    if (!isEncrypted && !ALLOWED_FILE_TYPES.includes(req.file.mimetype)) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }

    // Build the URL path relative to the server (frontend will resolve to correct origin)
    const relativePath = path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/');
    const fileUrl = `/uploads/${relativePath}`;

    res.status(201).json({
      file: {
        url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Error handling for multer
router.use((err: Error, _req: Request, res: Response, _next: Function) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. Maximum size is 25MB.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message });
    return;
  }
});

export default router;
