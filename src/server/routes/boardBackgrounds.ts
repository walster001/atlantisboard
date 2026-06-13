import { Router, type RequestHandler } from 'express';
import {
  getBoardBackgroundObjectStream,
  getBoardBackgroundPreviewBuffer,
} from '../services/boardBackgroundService.js';
import { boardBackgroundDownloadRateLimiter } from '../middleware/rateLimit.js';
import { requireSignedAssetOrAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { parseBoardBackgroundPreviewPreset } from '../../shared/boardBackgroundAsset.js';

const router = Router();

router.get('/:fileId', boardBackgroundDownloadRateLimiter, ((req, res, next) => {
  void (async () => {
    try {
      const assetPath = `/api/v1/board-backgrounds/${req.params.fileId}`;
      const allowed = await requireSignedAssetOrAuth(req, res, assetPath);
      if (!allowed) {
        return;
      }
      const previewPreset = parseBoardBackgroundPreviewPreset(
        typeof req.query.preview === 'string' ? req.query.preview : undefined,
      );
      if (previewPreset != null) {
        const preview = await getBoardBackgroundPreviewBuffer(
          req.params.fileId,
          previewPreset.maxWidth,
          previewPreset.quality,
        );
        if (preview == null) {
          res.status(404).json({
            error: {
              message: 'File not found',
              code: 'NOT_FOUND',
              statusCode: 404,
            },
          });
          return;
        }
        res.setHeader('Content-Type', preview.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(preview.buffer);
        return;
      }
      const result = await getBoardBackgroundObjectStream(req.params.fileId);
      if (result == null) {
        res.status(404).json({
          error: {
            message: 'File not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      result.stream.on('error', (err) => {
        logger.error({ err }, 'Board background stream error');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  })();
}) as RequestHandler);

export { router as boardBackgroundRoutes };
