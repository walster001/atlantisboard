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
import { parseOrThrow, respondZodValidationError } from '../../utils/zodValidation.js';

const brandingUpload = multer({
  storage: multer.memoryStorage(),
  /** Large enough for home background images (see brandingService MAX_HOME_BG_IMAGE_BYTES). */
  limits: { fileSize: 10 * 1024 * 1024 },
});

const deleteBrandingFileBodySchema = z.object({
  url: z.string().min(1),
});

const brandingUploadQuerySchema = z.object({
  type: z.enum(['logo', 'favicon', 'home-nav-icon', 'home-bg-image', 'board-nav-icon']),
});

const brandingUploadKindByType: Record<
  z.infer<typeof brandingUploadQuerySchema>['type'],
  BrandingUploadKind
> = {
  logo: 'login-logo',
  favicon: 'favicon',
  'home-nav-icon': 'home-nav-icon',
  'home-bg-image': 'home-bg-image',
  'board-nav-icon': 'board-nav-icon',
};

export function registerBrandingRoutes(router: Router): void {
  router.post(
    '/branding/upload',
    fileUploadRateLimiter,
    brandingUpload.single('file'),
    async (req, res, next) => {
      try {
        const { type } = parseOrThrow(brandingUploadQuerySchema, req.query);
        const kind = brandingUploadKindByType[type];
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
        if (respondZodValidationError(res, error)) {
          return;
        }
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
      const { url } = parseOrThrow(deleteBrandingFileBodySchema, req.body);
      await deleteBrandingObjectByPublicUrl(url);
      res.status(204).end();
    } catch (error) {
      if (respondZodValidationError(res, error)) {
        return;
      }
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
