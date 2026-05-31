import { Router, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { requireAuth } from '../middleware/auth.js';
import {
  attachmentStreamRateLimiter,
  attachmentUrlMintRateLimiter,
  fileUploadRateLimiter,
} from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../types/express.js';
import { CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES } from '../constants/uploads.js';
import {
  MAX_CARD_ATTACHMENT_BYTES,
  uploadCardAttachment,
  deleteCardAttachment,
  buildAttachmentStreamUrl,
  openAttachmentReadStream,
  type CardAttachmentUploadPayload,
} from '../services/attachmentService.js';
import { resolveAttachmentForUser } from '../services/attachmentAccessService.js';
import { Card } from '../models/Card.js';
import { hasPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';

const router = Router();

type ParsedAttachmentRange =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly start: number; readonly endInclusive: number }
  | { readonly kind: 'unsatisfiable' };

/**
 * Parse a single `Range: bytes=…` header (RFC 9110). Multipart ranges are rejected.
 * Mobile `<video>` playback often depends on the server honouring range requests.
 */
function parseSingleHttpBytesRange(rangeHeader: string | undefined, size: number): ParsedAttachmentRange {
  if (rangeHeader === undefined || rangeHeader.trim() === '') {
    return { kind: 'full' };
  }
  const raw = rangeHeader.trim();
  if (!/^bytes=/i.test(raw)) {
    return { kind: 'full' };
  }
  if (size === 0) {
    return { kind: 'unsatisfiable' };
  }
  const spec = raw.slice(6).trim();
  if (spec.includes(',')) {
    return { kind: 'unsatisfiable' };
  }
  const dashIndex = spec.indexOf('-');
  if (dashIndex < 0) {
    return { kind: 'unsatisfiable' };
  }
  const left = spec.slice(0, dashIndex).trim();
  const right = spec.slice(dashIndex + 1).trim();

  if (left === '' && right !== '') {
    const suffixLen = Number.parseInt(right, 10);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
      return { kind: 'unsatisfiable' };
    }
    const span = Math.min(suffixLen, size);
    const start = size - span;
    return { kind: 'partial', start, endInclusive: size - 1 };
  }

  if (left !== '' && right === '') {
    const start = Number.parseInt(left, 10);
    if (!Number.isFinite(start) || start < 0 || start >= size) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'partial', start, endInclusive: size - 1 };
  }

  if (left !== '' && right !== '') {
    const start = Number.parseInt(left, 10);
    const end = Number.parseInt(right, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      return { kind: 'unsatisfiable' };
    }
    if (start >= size) {
      return { kind: 'unsatisfiable' };
    }
    const endInclusive = Math.min(end, size - 1);
    if (endInclusive < start) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'partial', start, endInclusive };
  }

  return { kind: 'unsatisfiable' };
}

function tempAttachmentBasename(originalname: string): string {
  const ext = (originalname.split('.').pop() ?? '').trim();
  const safe =
    ext.length > 0 && ext.length <= 16 && /^[a-zA-Z0-9]+$/.test(ext) ? `.${ext.toLowerCase()}` : '';
  return `kanboard-card-att-${randomUUID()}${safe}`;
}

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CARD_ATTACHMENT_BYTES,
  },
});

const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, tmpdir());
    },
    filename: (_req, file, cb) => {
      cb(null, tempAttachmentBasename(file.originalname));
    },
  }),
  limits: {
    fileSize: MAX_CARD_ATTACHMENT_BYTES,
  },
});

/** Prefer RAM for small multipart bodies; stream to disk when likely over ~20 MiB or length unknown. */
function shouldUseInMemoryMultipartBuffer(req: Request): boolean {
  const raw = req.headers['content-length'];
  if (raw === undefined) {
    return false;
  }
  const header = Array.isArray(raw) ? raw[0] : raw;
  const contentLength = Number.parseInt(header, 10);
  if (!Number.isFinite(contentLength)) {
    return false;
  }
  return contentLength <= CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES;
}

const cardAttachmentMulterUpload: RequestHandler = (req, res, next) => {
  const handler = shouldUseInMemoryMultipartBuffer(req)
    ? uploadMemory.single('file')
    : uploadDisk.single('file');
  handler(req, res, next);
};

function payloadFromMulterFile(file: Express.Multer.File): CardAttachmentUploadPayload {
  if (typeof file.path === 'string' && file.path.length > 0) {
    return { kind: 'disk', path: file.path, size: file.size };
  }
  if (file.buffer != null) {
    return { kind: 'memory', buffer: file.buffer };
  }
  throw new Error('Invalid uploaded file');
}

// All routes require authentication
router.use(requireAuth as RequestHandler);

/**
 * Upload attachment to card
 * POST /api/v1/cards/:cardId/attachments
 */
router.post('/cards/:cardId/attachments', fileUploadRateLimiter, cardAttachmentMulterUpload, async (req, res, next) => {
  const uploaded = req.file;
  const tempPath =
    uploaded !== undefined && typeof uploaded.path === 'string' && uploaded.path.length > 0
      ? uploaded.path
      : undefined;
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId } = req.params;

    if (!uploaded) {
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
      payloadFromMulterFile(uploaded),
      uploaded.originalname,
      uploaded.mimetype,
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
  } finally {
    if (tempPath !== undefined) {
      await unlink(tempPath).catch(() => {});
    }
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

function sendAttachmentAccessFailure(
  res: Response,
  failure: { readonly status: 404 | 403; readonly code: string; readonly message: string },
): void {
  res.status(failure.status).json({
    error: {
      message: failure.message,
      code: failure.code,
      statusCode: failure.status,
    },
  });
}

/**
 * Mint stream URL (presigned MinIO or API proxy fallback)
 * GET /api/v1/attachments/:attachmentId/url
 */
router.get(
  '/attachments/:attachmentId/url',
  attachmentUrlMintRateLimiter,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { attachmentId } = req.params;

      const resolved = await resolveAttachmentForUser(attachmentId, authReq.user);
      if ('status' in resolved) {
        sendAttachmentAccessFailure(res, resolved);
        return;
      }

      const stream = await buildAttachmentStreamUrl(attachmentId, resolved.objectMeta);

      logger.info(
        {
          event: 'attachment.url_mint',
          attachmentId,
          delivery: stream.delivery,
          contentType: resolved.objectMeta.contentType,
          size: resolved.objectMeta.size,
          userId: authReq.user.id,
        },
        'Attachment stream URL minted',
      );

      res.setHeader('Cache-Control', 'private, max-age=60');
      res.json({
        url: stream.url,
        expiresAt: stream.expiresAt,
        delivery: stream.delivery,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Stream attachment content through API (authenticated)
 * GET /api/v1/attachments/:attachmentId/file
 */
router.get('/attachments/:attachmentId/file', attachmentStreamRateLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { attachmentId } = req.params;

    const resolved = await resolveAttachmentForUser(attachmentId, authReq.user);
    if ('status' in resolved) {
      sendAttachmentAccessFailure(res, resolved);
      return;
    }

    const meta = resolved.objectMeta;
    const rangeHeader = req.headers.range;
    const rangeRaw = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;
    const parsed = parseSingleHttpBytesRange(
      typeof rangeRaw === 'string' ? rangeRaw : undefined,
      meta.size,
    );

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', meta.contentType);

    if (parsed.kind === 'unsatisfiable') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${meta.size}`);
      res.end();
      return;
    }

    logger.info(
      {
        event: 'attachment.proxy_stream',
        attachmentId,
        rangeKind: parsed.kind,
        contentType: meta.contentType,
        size: meta.size,
        userId: authReq.user.id,
      },
      'Attachment proxy stream',
    );

    if (parsed.kind === 'full') {
      res.status(200);
      res.setHeader('Content-Length', String(meta.size));
      if (meta.size === 0) {
        res.end();
        return;
      }
      const stream = await openAttachmentReadStream(meta.objectName, null);
      stream.on('error', next);
      stream.pipe(res);
      return;
    }

    const byteLen = parsed.endInclusive - parsed.start + 1;
    res.status(206);
    res.setHeader('Content-Length', String(byteLen));
    res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.endInclusive}/${meta.size}`);
    const stream = await openAttachmentReadStream(meta.objectName, {
      start: parsed.start,
      endInclusive: parsed.endInclusive,
    });
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export { router as attachmentRoutes };

