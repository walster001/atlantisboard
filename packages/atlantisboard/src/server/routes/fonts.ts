import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireSignedAssetOrAuth } from '../middleware/auth.js';
import { getFontObjectStream, listFontCatalog } from '../services/fontService.js';
import { logger } from '../utils/logger.js';

const router = Router();
const apiRateLimiter = createRateLimiter('api');

router.get('/', apiRateLimiter, async (_req, res, next) => {
  try {
    const fonts = await listFontCatalog();
    res.json({ fonts });
  } catch (error) {
    next(error);
  }
});

router.get('/:fileName', apiRateLimiter, ((req, res, next) => {
  const raw = req.params.fileName;
  const fileName = typeof raw === 'string' ? raw.replace(/\\/g, '/').split('/').pop() ?? '' : '';
  void (async () => {
    try {
      const assetPath = `/api/v1/fonts/${fileName}`;
      const allowed = await requireSignedAssetOrAuth(req, res, assetPath);
      if (!allowed) {
        return;
      }
      const result = await getFontObjectStream(fileName);
      if (!result) {
        res.status(404).json({
          error: {
            message: 'Font not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      result.stream.on('error', (err) => {
        logger.error({ err }, 'Font stream error');
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

export { router as fontRoutes };
