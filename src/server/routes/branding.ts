import { Router, type RequestHandler } from 'express';
import { getBrandingObjectStream, type BrandingUploadKind } from '../services/brandingService.js';
import { logger } from '../utils/logger.js';

const router = Router();

function sendBrandingFile(
  res: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
  kind: BrandingUploadKind,
  fileId: string
): void {
  void (async () => {
    try {
      const result = await getBrandingObjectStream(kind, fileId);
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
        logger.error({ err }, 'Branding stream error');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  })();
}

router.get('/login-logo/:fileId', ((req, res, next) => {
  sendBrandingFile(res, next, 'login-logo', req.params.fileId);
}) as RequestHandler);

router.get('/favicon/:fileId', ((req, res, next) => {
  sendBrandingFile(res, next, 'favicon', req.params.fileId);
}) as RequestHandler);

router.get('/home-nav-icon/:fileId', ((req, res, next) => {
  sendBrandingFile(res, next, 'home-nav-icon', req.params.fileId);
}) as RequestHandler);

router.get('/home-bg-image/:fileId', ((req, res, next) => {
  sendBrandingFile(res, next, 'home-bg-image', req.params.fileId);
}) as RequestHandler);

router.get('/board-nav-icon/:fileId', ((req, res, next) => {
  sendBrandingFile(res, next, 'board-nav-icon', req.params.fileId);
}) as RequestHandler);

export { router as brandingRoutes };
