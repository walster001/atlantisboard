import { Router, type RequestHandler } from 'express';
import { getBoardBackgroundObjectStream } from '../services/boardBackgroundService.js';
import { boardBackgroundDownloadRateLimiter } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/:fileId', boardBackgroundDownloadRateLimiter, ((req, res, next) => {
  void (async () => {
    try {
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
