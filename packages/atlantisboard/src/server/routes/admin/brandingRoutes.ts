import type { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { fileUploadRateLimiter } from '../../middleware/rateLimit.js';
import {
  deleteBrandingObjectByPublicUrl,
  uploadBrandingAsset,
  type BrandingUploadKind,
} from '../../services/brandingService.js';
import { mapServiceErrorToHttp } from '../../utils/mapServiceErrorToHttp.js';

const brandingUpload = multer({
  storage: multer.memoryStorage(),
  /** Large enough for home background images (see brandingService MAX_HOME_BG_IMAGE_BYTES). */
  limits: { fileSize: 10 * 1024 * 1024 },
});

const deleteBrandingFileBodySchema = z.object({
  url: z.string().min(1),
});

export function registerBrandingRoutes(router: Router): void {
  router.post(
    '/branding/upload',
    fileUploadRateLimiter,
    brandingUpload.single('file'),
    async (req, res, next) => {
      try {
        const typeRaw = req.query.type;
        const type = typeof typeRaw === 'string' ? typeRaw : '';
        const typeToKind: Record<string, BrandingUploadKind> = {
          logo: 'login-logo',
          favicon: 'favicon',
          'home-nav-icon': 'home-nav-icon',
          'home-bg-image': 'home-bg-image',
          'board-nav-icon': 'board-nav-icon',
        };
        const kind = typeToKind[type];
        if (!kind) {
          res.status(400).json({
            error: {
              message:
                'Query parameter type must be "logo", "favicon", "home-nav-icon", "home-bg-image", or "board-nav-icon"',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
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
        const url = await uploadBrandingAsset(
          req.file.buffer,
          req.file.mimetype,
          kind,
          req.file.originalname,
        );
        res.json({ url });
      } catch (error) {
        if (error instanceof Error) {
          res.status(400).json({
            error: {
              message: error.message,
              code: 'BRANDING_UPLOAD_FAILED',
              statusCode: 400,
            },
          });
          return;
        }
        next(error);
      }
    },
  );

  router.delete('/branding/file', async (req, res, next) => {
    try {
      const { url } = deleteBrandingFileBodySchema.parse(req.body);
      await deleteBrandingObjectByPublicUrl(url);
      res.status(204).end();
    } catch (error) {
      if (mapServiceErrorToHttp(res, error)) {
        return;
      }
      if (error instanceof Error && error.message === 'Invalid branding asset URL') {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      next(error);
    }
  });
}
