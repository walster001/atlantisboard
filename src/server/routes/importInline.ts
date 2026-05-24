import { Router, type RequestHandler } from 'express';
import { getImportInlineObjectStream } from '../services/importInlineAssetService.js';
import { requireSignedAssetOrAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/:fileId', ((req, res, next) => {
  void (async () => {
    try {
      const rawId = req.params.fileId;
      const fileId = typeof rawId === 'string' ? rawId.replace(/\\/g, '/').split('/').pop() ?? '' : '';
      const assetPath = `/api/v1/import-inline/${fileId}`;
      const allowed = await requireSignedAssetOrAuth(req, res, assetPath);
      if (!allowed) {
        return;
      }
      const result = await getImportInlineObjectStream(fileId);
      if (!result) {
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
        logger.error({ err }, 'import-inline stream error');
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

export { router as importInlineRoutes };
