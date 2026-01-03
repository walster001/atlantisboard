/**
 * Storage Routes - File Upload/Download/Delete
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { storageService } from '../services/storage.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { permissionService } from '../lib/permissions/service.js';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/storage/:bucket/upload
 * Upload a file to a storage bucket
 */
router.post('/:bucket/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { bucket } = req.params;
    const { path } = req.body;
    const file = req.file;

    // Log upload attempt
    console.log('[Storage Upload] Attempting upload:', {
      bucket,
      path,
      userId: authReq.userId,
      fileName: file?.originalname,
      fileSize: file?.size,
      fileType: file?.mimetype,
    });

    if (!storageService.isConfigured()) {
      const error = new ValidationError('Storage is not configured. Please configure S3 storage settings.');
      console.error('[Storage Upload] Storage not configured');
      throw error;
    }

    if (!file) {
      const error = new ValidationError('No file provided');
      console.error('[Storage Upload] No file provided in request');
      throw error;
    }

    if (!file.buffer || file.buffer.length === 0) {
      const error = new ValidationError('File buffer is empty');
      console.error('[Storage Upload] File buffer is empty');
      throw error;
    }

    if (!path) {
      const error = new ValidationError('Path is required');
      console.error('[Storage Upload] Path not provided');
      throw error;
    }

    // Validate file type and size based on bucket
    if (bucket === 'branding') {
      // Validate image file type
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        const error = new ValidationError('Only image files are allowed for branding uploads');
        console.error('[Storage Upload] Invalid file type for branding:', file.mimetype);
        throw error;
      }

      // Determine size limit based on path
      let maxSize: number;
      if (path.includes('inline-icon') || path.includes('import-icons')) {
        maxSize = 500 * 1024; // 500KB for icons
      } else if (path.includes('logo')) {
        maxSize = 2 * 1024 * 1024; // 2MB for logos
      } else {
        maxSize = 5 * 1024 * 1024; // 5MB for backgrounds and other images
      }

      if (file.size > maxSize) {
        const error = new ValidationError(`File size exceeds limit. Maximum size is ${Math.round(maxSize / 1024)}KB`);
        console.error('[Storage Upload] File too large:', {
          fileSize: file.size,
          maxSize,
          path,
        });
        throw error;
      }
    } else if (bucket === 'fonts') {
      // Validate font file type by extension (MIME types vary between browsers)
      const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
      const fileExtension = '.' + file.originalname.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(fileExtension)) {
        const error = new ValidationError('Only font files (.ttf, .otf, .woff, .woff2) are allowed');
        console.error('[Storage Upload] Invalid file extension for fonts:', {
          fileExtension,
          fileName: file.originalname,
          mimetype: file.mimetype,
        });
        throw error;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB for fonts
      if (file.size > maxSize) {
        const error = new ValidationError(`File size exceeds limit. Maximum size is 5MB`);
        console.error('[Storage Upload] Font file too large:', {
          fileSize: file.size,
          maxSize,
          fileName: file.originalname,
        });
        throw error;
      }
    }

    // Check permissions based on bucket
    if (bucket === 'card-attachments') {
      // Need to get boardId from card to check permissions
      const cardId = path.split('/')[0];
      if (cardId) {
        // Get card to find board
        const { prisma } = await import('../db/client.js');
        const card = await prisma.card.findUnique({
          where: { id: cardId },
          include: { column: true },
        });

        if (card) {
          const context = permissionService.buildContext(
            authReq.userId!,
            authReq.user?.isAdmin ?? false,
            card.column.boardId
          );
          await permissionService.requirePermission('attachment.upload', context);
        }
      }
    } else if (bucket === 'branding' || bucket === 'fonts') {
      // Admin-only for branding and fonts
      const context = permissionService.buildContext(authReq.userId!, authReq.user?.isAdmin ?? false);
      if (bucket === 'branding') {
        await permissionService.requirePermission('app.admin.branding.edit', context);
      } else if (bucket === 'fonts') {
        await permissionService.requirePermission('app.admin.fonts.edit', context);
      }
    }

    // Upload file
    console.log('[Storage Upload] Starting upload to storage service...');
    const fileUrl = await storageService.upload(bucket, path, file.buffer, file.mimetype);
    const publicUrl = storageService.getPublicUrl(bucket, path);

    console.log('[Storage Upload] Upload successful:', {
      bucket,
      path,
      fileUrl,
      publicUrl,
    });

    res.json({
      path,
      url: fileUrl,
      publicUrl,
    });
  } catch (error: any) {
    // Log detailed error information
    console.error('[Storage Upload] Upload failed:', {
      bucket: req.params.bucket,
      path: req.body?.path,
      userId: (req as AuthRequest).userId,
      error: error.message,
      stack: error.stack,
      name: error.name,
      statusCode: error.statusCode,
    });

    // Pass error to error handler
    next(error);
  }
});

/**
 * GET /api/storage/:bucket/:path(*)
 * Download a file from storage
 */
router.get('/:bucket/*', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { bucket } = req.params;
    const path = req.params[0]; // Get everything after bucket/

    if (!path) {
      throw new ValidationError('Path is required');
    }

    // Check permissions
    if (bucket === 'card-attachments') {
      const cardId = path.split('/')[0];
      if (cardId) {
        const { prisma } = await import('../db/client.js');
        const card = await prisma.card.findUnique({
          where: { id: cardId },
          include: { column: true },
        });

        if (card) {
          const context = permissionService.buildContext(
            authReq.userId!,
            authReq.user?.isAdmin ?? false,
            card.column.boardId
          );
          await permissionService.requirePermission('attachment.download', context);
        }
      }
    } else if (bucket === 'branding' || bucket === 'fonts') {
      // Public read access for branding and fonts
      // No permission check needed
    }

    // Get download URL (signed URL for private files)
    const downloadUrl = await storageService.getDownloadUrl(bucket, path);

    // Redirect to signed URL
    res.redirect(downloadUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/storage/:bucket/:path(*)
 * Delete a file from storage
 */
router.delete('/:bucket/*', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { bucket } = req.params;
    const path = req.params[0];

    if (!path) {
      throw new ValidationError('Path is required');
    }

    // Check permissions
    if (bucket === 'card-attachments') {
      const cardId = path.split('/')[0];
      if (cardId) {
        const { prisma } = await import('../db/client.js');
        const card = await prisma.card.findUnique({
          where: { id: cardId },
          include: { column: true },
        });

        if (card) {
          const context = permissionService.buildContext(
            authReq.userId!,
            authReq.user?.isAdmin ?? false,
            card.column.boardId
          );
          await permissionService.requirePermission('attachment.delete', context);
        }
      }
    } else if (bucket === 'branding' || bucket === 'fonts') {
      const context = permissionService.buildContext(authReq.userId!, authReq.user?.isAdmin ?? false);
      if (bucket === 'branding') {
        await permissionService.requirePermission('app.admin.branding.edit', context);
      } else if (bucket === 'fonts') {
        await permissionService.requirePermission('app.admin.fonts.edit', context);
      }
    }

    // Delete file
    await storageService.delete(bucket, path);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/storage/:bucket/:path(*)/public-url
 * Get public URL for a file (for public buckets)
 */
router.get('/:bucket/*/public-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bucket } = req.params;
    const path = req.params[0].replace(/\/public-url$/, '');

    if (!path) {
      throw new ValidationError('Path is required');
    }

    const publicUrl = storageService.getPublicUrl(bucket, path);

    res.json({ publicUrl });
  } catch (error) {
    next(error);
  }
});

export default router;

