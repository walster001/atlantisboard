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
import { CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES, getCardAttachmentMaxBytes } from '../constants/uploads.js';
import {
  MAX_CARD_ATTACHMENT_BYTES,
  uploadCardAttachment,
  deleteCardAttachment,
  buildAttachmentStreamUrl,
  buildAttachmentProxyUrl,
  openAttachmentReadStream,
  type CardAttachmentUploadPayload,
} from '../services/attachmentService.js';
import { resolveAttachmentForUser, resolveAttachmentPosterPreview } from '../services/attachmentAccessService.js';
import { Card } from '../models/Card.js';
import { hasPermission } from '../utils/permissions.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
import { logger } from '../utils/logger.js';
import { parseAttachmentPreviewQuery } from '../../shared/attachmentPreviewQuery.js';
import { getAttachmentPreviewBuffer } from '../services/attachmentService/preview.js';
import {
  getImportPlaceholderVideoPreviewBuffer,
  getVideoAttachmentPosterPreviewBuffer,
} from '../services/attachmentService/videoPosterPreview.js';
import {
  mintPresignedAttachmentRedirectUrl,
  shouldPresignRedirectAttachmentStream,
} from '../services/attachmentService/streamDelivery.js';
import {
  ensureVideoSourceHeightOnAttachment,
  resolveVideoQualityMeta,
} from '../services/attachmentService/videoMeta.js';
import {
  isVideoAbrJobQueued,
  scheduleVideoAbrPackaging,
} from '../services/attachmentService/videoAbrTranscode.js';
import {
  isVideoPosterCacheJobQueued,
  scheduleVideoPosterCache,
} from '../services/attachmentService/videoPosterCache.js';
import {
  defaultVideoAbrManifestPath,
  videoAbrObjectContentType,
  type VideoAbrFormat,
} from '../../shared/videoStreaming.js';
import {
  videoAbrObjectKey,
} from '../services/attachmentService/videoAbrPaths.js';
import {
  rewriteDashManifestForProxy,
  rewriteHlsPlaylistForProxy,
} from '../services/attachmentService/videoAbrManifest.js';
import { isVideoAttachmentContentType } from '../config/attachmentDelivery.js';
import { invalidateAttachmentLocationCache } from '../services/attachmentCache.js';
import { pipeReadableToServerResponse } from '../utils/pipeReadableToServerResponse.js';
import type { Readable } from 'node:stream';
import { createUploadDiskHeadroomGuard } from '../middleware/uploadDiskHeadroom.js';
import { parseRequestContentLengthBytes } from '../utils/diskSpaceGuard.js';
import { ValidationError } from '../../shared/errors/domainErrors.js';

const router = Router();

const cardAttachmentDiskHeadroomGuard = createUploadDiskHeadroomGuard(getCardAttachmentMaxBytes);

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
  const contentLength = parseRequestContentLengthBytes(req.headers['content-length']);
  if (contentLength == null) {
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
  throw new ValidationError('Invalid uploaded file');
}

// All routes require authentication
router.use(requireAuth as RequestHandler);

/**
 * Upload attachment to card
 * POST /api/v1/cards/:cardId/attachments
 */
router.post(
  '/cards/:cardId/attachments',
  fileUploadRateLimiter,
  cardAttachmentDiskHeadroomGuard,
  cardAttachmentMulterUpload,
  async (req, res, next) => {
  const uploaded = req.file;
  const tempPath =
    uploaded !== undefined && typeof uploaded.path === 'string' && uploaded.path.length > 0
      ? uploaded.path
      : undefined;
  let releaseTempPath = true;
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

    const decorationRaw = req.body?.decoration;
    const decorationOnly = decorationRaw === 'true' || decorationRaw === true;

    const result = await uploadCardAttachment(
      cardId,
      payloadFromMulterFile(uploaded),
      uploaded.originalname,
      uploaded.mimetype,
      authReq.user.id,
      undefined,
      {
        ...(tempPath != null ? { localScanPath: tempPath } : {}),
        ...(decorationOnly ? { decorationOnly: true as const } : {}),
      },
    );
    if (result.releaseLocalUploadTemp === false) {
      releaseTempPath = false;
    }

    res.status(201).json({ attachment: result });
  } catch (error) {
    handleApiRouteError(res, error, next);
  } finally {
    if (tempPath !== undefined && releaseTempPath) {
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
    handleApiRouteError(res, error, next);
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

async function persistVideoSourceHeightIfProbed(args: {
  readonly attachmentId: string;
  readonly attachment: Pick<import('../models/Card.js').ICardAttachment, 'videoSourceHeight' | 'url'>;
  readonly objectName: string;
}): Promise<number | null> {
  const probed = await ensureVideoSourceHeightOnAttachment({
    attachment: args.attachment,
    objectName: args.objectName,
  });
  if (
    probed != null &&
    (args.attachment.videoSourceHeight == null || args.attachment.videoSourceHeight !== probed)
  ) {
    await Card.updateOne(
      { 'attachments.id': args.attachmentId },
      { $set: { 'attachments.$.videoSourceHeight': probed } },
    );
    await invalidateAttachmentLocationCache(args.attachmentId);
  }
  return probed ?? args.attachment.videoSourceHeight ?? null;
}

/**
 * Video quality metadata for the card-description player.
 * GET /api/v1/attachments/:attachmentId/video-meta
 */
router.get(
  '/attachments/:attachmentId/video-meta',
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

      if (!isVideoAttachmentContentType(resolved.objectMeta.contentType)) {
        res.status(404).json({
          error: {
            message: 'Attachment is not a video',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      const sourceHeight = await persistVideoSourceHeightIfProbed({
        attachmentId,
        attachment: resolved.attachment,
        objectName: resolved.objectMeta.objectName,
      });

      const effectiveHeight = sourceHeight ?? resolved.attachment.videoSourceHeight ?? null;
      if (!isVideoPosterCacheJobQueued(resolved.objectMeta.objectName)) {
        scheduleVideoPosterCache({
          objectName: resolved.objectMeta.objectName,
          contentType: resolved.objectMeta.contentType,
        });
      }
      if (!isVideoAbrJobQueued(resolved.objectMeta.objectName)) {
        scheduleVideoAbrPackaging({
          attachmentId,
          objectName: resolved.objectMeta.objectName,
        });
      }

      const meta = await resolveVideoQualityMeta({
        attachmentId,
        attachment: resolved.attachment,
        objectName: resolved.objectMeta.objectName,
        sourceHeight: effectiveHeight,
      });

      res.setHeader('Cache-Control', 'private, max-age=60');
      res.json(meta);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Authenticated ABR manifest/segment proxy (HLS m3u8/ts, DASH mpd/m4s).
 * GET /api/v1/attachments/:attachmentId/stream/:format?path=hls/master.m3u8
 */
router.get(
  '/attachments/:attachmentId/stream/:format',
  attachmentStreamRateLimiter,
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { attachmentId, format: formatRaw } = req.params;
      const format = formatRaw === 'hls' || formatRaw === 'dash' ? formatRaw : null;
      if (format == null) {
        res.status(400).json({
          error: {
            message: 'Invalid stream format',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      const pathRaw = typeof req.query.path === 'string' ? req.query.path.trim() : '';
      const relativePath = pathRaw !== '' ? pathRaw : defaultVideoAbrManifestPath(format as VideoAbrFormat);
      if (relativePath.includes('..')) {
        res.status(400).json({
          error: {
            message: 'Invalid stream path',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      const resolved = await resolveAttachmentForUser(attachmentId, authReq.user);
      if ('status' in resolved) {
        sendAttachmentAccessFailure(res, resolved);
        return;
      }

      if (!isVideoAttachmentContentType(resolved.objectMeta.contentType)) {
        res.status(404).json({
          error: {
            message: 'Attachment is not a video',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      const objectKey = videoAbrObjectKey(resolved.objectMeta.objectName, relativePath);
      let stream: NodeJS.ReadableStream;
      try {
        stream = await openAttachmentReadStream(objectKey, null);
      } catch (error: unknown) {
        const code = error != null && typeof error === 'object' ? (error as { code?: string }).code : undefined;
        if (code === 'NotFound' || code === 'NoSuchKey') {
          res.status(404).json({
            error: {
              message: 'ABR stream object not found',
              code: 'NOT_FOUND',
              statusCode: 404,
            },
          });
          return;
        }
        throw error;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array),
        );
      }
      const body = Buffer.concat(chunks);
      const contentType = videoAbrObjectContentType(relativePath);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Type', contentType);

      if (format === 'hls' && relativePath.endsWith('.m3u8')) {
        const rewritten = rewriteHlsPlaylistForProxy(body.toString('utf8'), attachmentId, relativePath);
        res.setHeader('Content-Length', String(Buffer.byteLength(rewritten, 'utf8')));
        res.status(200).send(rewritten);
        return;
      }

      if (format === 'dash' && relativePath.endsWith('.mpd')) {
        const rewritten = rewriteDashManifestForProxy(body.toString('utf8'), attachmentId);
        res.setHeader('Content-Length', String(Buffer.byteLength(rewritten, 'utf8')));
        res.status(200).send(rewritten);
        return;
      }

      res.setHeader('Content-Length', String(body.length));
      res.status(200).send(body);
    } catch (error) {
      next(error);
    }
  },
);

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
router.get('/attachments/:attachmentId/file', attachmentStreamRateLimiter, streamAttachmentFileHandler);

/**
 * Legacy card-scoped attachment file URL (redirect to canonical route).
 * GET /api/v1/cards/:cardId/attachments/:attachmentId/file
 */
router.get(
  '/cards/:cardId/attachments/:attachmentId/file',
  attachmentStreamRateLimiter,
  (req, res) => {
    res.redirect(307, buildAttachmentProxyUrl(req.params.attachmentId));
  },
);

async function streamAttachmentFileHandler(req: import('express').Request, res: Response, next: import('express').NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const { attachmentId } = req.params;
    const previewQuery = parseAttachmentPreviewQuery(
      typeof req.query.preview === 'string' ? req.query.preview : undefined,
    );

    if (previewQuery?.kind === 'video_poster') {
      const posterResolved = await resolveAttachmentPosterPreview(attachmentId, authReq.user);
      if ('status' in posterResolved) {
        sendAttachmentAccessFailure(res, posterResolved);
        return;
      }

      const posterPreview =
        posterResolved.kind === 'import_placeholder'
          ? await getImportPlaceholderVideoPreviewBuffer(previewQuery)
          : await getVideoAttachmentPosterPreviewBuffer({
              objectName: posterResolved.objectMeta.objectName,
              contentType: posterResolved.objectMeta.contentType,
              preset: previewQuery,
            });

      if (posterPreview != null) {
        res.setHeader('Accept-Ranges', 'none');
        res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
        res.setHeader('Content-Type', posterPreview.contentType);
        res.setHeader('Content-Length', String(posterPreview.buffer.length));
        res.status(200).send(posterPreview.buffer);
        return;
      }
    }

    const resolved = await resolveAttachmentForUser(attachmentId, authReq.user);
    if ('status' in resolved) {
      sendAttachmentAccessFailure(res, resolved);
      return;
    }

    const meta = resolved.objectMeta;
    if (
      shouldPresignRedirectAttachmentStream({
        contentType: meta.contentType,
        size: meta.size,
        hasPreviewQuery: previewQuery != null,
      })
    ) {
      const redirectUrl = await mintPresignedAttachmentRedirectUrl(attachmentId, meta);
      if (redirectUrl != null) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.redirect(307, redirectUrl);
        return;
      }
    }
    if (previewQuery?.kind === 'card_image') {
      const preview = await getAttachmentPreviewBuffer(
        resolved.attachment.url,
        meta.contentType,
        previewQuery.maxWidth,
        previewQuery.quality,
      );
      if (preview != null) {
        res.setHeader('Accept-Ranges', 'none');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Type', preview.contentType);
        res.setHeader('Content-Length', String(preview.buffer.length));
        res.status(200).send(preview.buffer);
        return;
      }
    }

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

    const logPayload = {
      event: 'attachment.proxy_stream',
      attachmentId,
      rangeKind: parsed.kind,
      contentType: meta.contentType,
      size: meta.size,
      userId: authReq.user.id,
    };
    logger.debug(logPayload, 'Attachment proxy stream');

    const pipeSource = (stream: NodeJS.ReadableStream): void => {
      pipeReadableToServerResponse(req, res, stream as Readable, {
        onStreamError: (error) => {
          next(error);
        },
      });
    };

    if (parsed.kind === 'full') {
      res.status(200);
      res.setHeader('Content-Length', String(meta.size));
      if (meta.size === 0) {
        res.end();
        return;
      }
      const stream = await openAttachmentReadStream(meta.objectName, null);
      pipeSource(stream);
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
    pipeSource(stream);
  } catch (error) {
    next(error);
  }
}

export { router as attachmentRoutes };

