import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { fileUploadRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import {
  uploadCardAttachment,
  deleteCardAttachment,
  getAttachmentUrl,
  getAttachmentObject,
} from '../services/attachmentService.js';
import { isPlaceholderCardAttachment } from '../../shared/cardAttachmentPlaceholder.js';
import { Card } from '../models/Card.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1000 * 1024 * 1024, // 1000 MB
  },
});

// All routes require authentication
router.use(requireAuth as RequestHandler);

/**
 * Upload attachment to card
 * POST /api/v1/cards/:cardId/attachments
 */
router.post('/cards/:cardId/attachments', fileUploadRateLimiter, upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId } = req.params;

    if (!req.file) {
      res.status(400).json({
        error: {
          message: 'File is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    // Check permissions
    const card = await Card.findById(cardId);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    const allowed = await hasPermission(authReq.user, card.boardId.toString(), 'attachments.upload');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to upload attachments',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    const result = await uploadCardAttachment(
      cardId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      authReq.user.id
    );

    res.status(201).json({ attachment: result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('exceeds maximum')) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (error.message.includes('malware') || error.message.includes('security scan')) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
    }
    next(error);
  }
});

/**
 * Delete attachment from card
 * DELETE /api/v1/cards/:cardId/attachments/:attachmentId
 */
router.delete('/cards/:cardId/attachments/:attachmentId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId, attachmentId } = req.params;

    // Check permissions
    const card = await Card.findById(cardId);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    const canDeleteAny = await hasPermission(
      authReq.user,
      card.boardId.toString(),
      'attachments.delete'
    );
    const attachment = card.attachments.find((att) => att.id === attachmentId);

    // Only owner of attachment or admin/manager can delete
    if (
      !canDeleteAny &&
      attachment?.uploadedBy.toString() !== authReq.user.id
    ) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to delete attachment',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    await deleteCardAttachment(cardId, attachmentId, authReq.user.id);

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: {
          message: error.message,
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    next(error);
  }
});

/**
 * Get attachment download URL
 * GET /api/v1/attachments/:attachmentId/url
 */
router.get('/attachments/:attachmentId/url', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { attachmentId } = req.params;

    // Find card with this attachment
    const card = await Card.findOne({ 'attachments.id': attachmentId });
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Attachment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Any board member may request a download URL (upload/delete remain permission-gated).
    const allowed = await hasPermission(authReq.user, card.boardId.toString(), 'boards.view');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    const attachment = card.attachments.find((att) => att.id === attachmentId);
    if (!attachment) {
      res.status(404).json({
        error: {
          message: 'Attachment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (isPlaceholderCardAttachment(attachment)) {
      res.status(404).json({
        error: {
          message: 'No file has been uploaded for this attachment yet',
          code: 'ATTACHMENT_PLACEHOLDER',
          statusCode: 404,
        },
      });
      return;
    }

    const url = await getAttachmentUrl(attachment.url);

    res.json({ url });
  } catch (error) {
    next(error);
  }
});

/**
 * Stream attachment content through API (authenticated)
 * GET /api/v1/attachments/:attachmentId/file
 */
router.get('/attachments/:attachmentId/file', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { attachmentId } = req.params;

    const card = await Card.findOne({ 'attachments.id': attachmentId });
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Attachment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Stream/download is allowed for any board member (same baseline as `boards.view`); upload/delete stay gated.
    const allowed = await hasPermission(authReq.user, card.boardId.toString(), 'boards.view');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    const attachment = card.attachments.find((att) => att.id === attachmentId);
    if (!attachment) {
      res.status(404).json({
        error: {
          message: 'Attachment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (isPlaceholderCardAttachment(attachment)) {
      res.status(404).json({
        error: {
          message: 'No file has been uploaded for this attachment yet',
          code: 'ATTACHMENT_PLACEHOLDER',
          statusCode: 404,
        },
      });
      return;
    }

    const object = await getAttachmentObject(attachment.url);
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    object.stream.on('error', next);
    object.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export { router as attachmentRoutes };

