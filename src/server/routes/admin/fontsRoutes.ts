import type { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { fileUploadRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { getAdminConfig, updateAdminConfig } from '../../services/adminService.js';
import {
  deleteCustomFont,
  resolveFontFamilyValueForObjectKey,
  uploadCustomFont,
} from '../../services/fontService.js';

const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const fontDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(80)
  .regex(/^[^"\\\r\n<>&]+$/, 'Display name contains invalid characters');

export function registerFontsRoutes(router: Router): void {
  router.post(
    '/fonts/upload',
    fileUploadRateLimiter,
    fontUpload.single('file'),
    async (req, res, next) => {
      try {
        const displayNameRaw =
          typeof req.body.displayName === 'string' ? req.body.displayName : undefined;
        const displayName =
          displayNameRaw != null && displayNameRaw.trim() !== ''
            ? fontDisplayNameSchema.parse(displayNameRaw)
            : undefined;
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
        const font = await uploadCustomFont(
          req.file.buffer,
          req.file.mimetype,
          displayName,
          req.file.originalname,
        );
        res.status(201).json({ font });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              message: 'Validation failed',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
              errors: error.issues,
            },
          });
          return;
        }
        if (error instanceof Error) {
          res.status(400).json({
            error: {
              message: error.message,
              code: 'FONT_UPLOAD_FAILED',
              statusCode: 400,
            },
          });
          return;
        }
        next(error);
      }
    },
  );

  router.delete('/fonts/:fileName', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const raw = req.params.fileName;
      const fileName =
        typeof raw === 'string' ? raw.replace(/\\/g, '/').split('/').pop() ?? '' : '';
      const familyBefore = await resolveFontFamilyValueForObjectKey(fileName);
      await deleteCustomFont(fileName);
      if (familyBefore) {
        const cfg = await getAdminConfig();
        const stored = cfg.appScreenBranding?.defaultUiFontFamily?.trim();
        if (stored === familyBefore) {
          await updateAdminConfig(
            { appScreenBranding: { defaultUiFontFamily: null } },
            authReq.user.id,
          );
        }
      }
      res.status(204).end();
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid font file name') {
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
