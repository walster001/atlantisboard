/**
 * Storage Routes - File Upload/Download/Delete
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { storageService } from '../services/storage.service.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
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
router.post('/:bucket/upload', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bucket } = req.params;
    const { path } = req.body;
    const file = req.file;

    if (!file) {
      throw new ValidationError('No file provided');
    }

    if (!path) {
      throw new ValidationError('Path is required');
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
            req.userId!,
            req.user?.isAdmin ?? false,
            card.column.boardId
          );
          await permissionService.requirePermission('attachment.upload', context);
        }
      }
    } else if (bucket === 'branding' || bucket === 'fonts') {
      // Admin-only for branding and fonts
      const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false);
      if (bucket === 'branding') {
        await permissionService.requirePermission('app.admin.branding.edit', context);
      } else if (bucket === 'fonts') {
        await permissionService.requirePermission('app.admin.fonts.edit', context);
      }
    }

    // Upload file
    const fileUrl = await storageService.upload(bucket, path, file.buffer, file.mimetype);

    res.json({
      path,
      url: fileUrl,
      publicUrl: storageService.getPublicUrl(bucket, path),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/storage/:bucket/:path(*)
 * Download a file from storage
 */
router.get('/:bucket/*', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
            req.userId!,
            req.user?.isAdmin ?? false,
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
router.delete('/:bucket/*', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
            req.userId!,
            req.user?.isAdmin ?? false,
            card.column.boardId
          );
          await permissionService.requirePermission('attachment.delete', context);
        }
      }
    } else if (bucket === 'branding' || bucket === 'fonts') {
      const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false);
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
router.get('/:bucket/*/public-url', async (req: AuthRequest, res: Response, next: NextFunction) => {
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

