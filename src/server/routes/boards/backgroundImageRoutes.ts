import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { Board } from '../../models/Board.js';
import { updateBoard } from '../../services/boardService.js';
import { hydrateBoardThemeSettings } from '../../services/boardThemeService.js';
import {
  deleteBoardBackgroundByPublicUrl,
  uploadBoardBackgroundAsset,
} from '../../services/boardBackgroundService.js';
import { hasPermission } from '../../utils/permissions.js';
import { fileUploadRateLimiter } from '../../middleware/rateLimit.js';
import { boardBackgroundUpload } from './schemas.js';

export function registerBackgroundImageRoutes(router: Router): void {
  router.post(
    '/:id/background-image',
    fileUploadRateLimiter,
    boardBackgroundUpload.single('file'),
    async (req, res, next) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (req.file == null) {
          res.status(400).json({
            error: {
              message: 'File is required',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }

        const boardDoc = await Board.findById(req.params.id);
        if (boardDoc == null) {
          res.status(404).json({
            error: {
              message: 'Board not found',
              code: 'NOT_FOUND',
              statusCode: 404,
            },
          });
          return;
        }
        const isOwner = boardDoc.ownerId.toString() === authReq.user.id;
        if (!isOwner) {
          const canChangeTheme = await hasPermission(authReq.user, req.params.id, 'boards.themes.changetheme');
          if (!canChangeTheme) {
            res.status(403).json({
              error: {
                message: 'Insufficient permissions to update board theme/background',
                code: 'FORBIDDEN',
                statusCode: 403,
              },
            });
            return;
          }
        }

        const previousThemeSettings = await hydrateBoardThemeSettings(
          boardDoc.themeSettings,
          authReq.user.id,
        );
        const previousImageUrl =
          previousThemeSettings.backgroundMode === 'image'
            ? previousThemeSettings.backgroundImageUrl?.trim() ?? ''
            : '';
        if (previousImageUrl !== '') {
          await deleteBoardBackgroundByPublicUrl(previousImageUrl);
        }

        const url = await uploadBoardBackgroundAsset(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
        );
        const nextThemeSettings = await hydrateBoardThemeSettings(
          boardDoc.themeSettings,
          authReq.user.id,
        );
        const scaleInput = typeof req.body.backgroundImageScale === 'string' ? req.body.backgroundImageScale : '';
        const focalXInput =
          typeof req.body.backgroundFocalX === 'string' ? Number.parseFloat(req.body.backgroundFocalX) : undefined;
        const focalYInput =
          typeof req.body.backgroundFocalY === 'string' ? Number.parseFloat(req.body.backgroundFocalY) : undefined;
        nextThemeSettings.backgroundMode = 'image';
        nextThemeSettings.backgroundImageUrl = url;
        if (
          scaleInput === 'fill' ||
          scaleInput === 'fit' ||
          scaleInput === 'fit-top-left' ||
          scaleInput === 'smart-fill'
        ) {
          nextThemeSettings.backgroundImageScale = scaleInput;
        }
        if (focalXInput != null && Number.isFinite(focalXInput)) {
          nextThemeSettings.backgroundFocalX = Math.max(0, Math.min(1, focalXInput));
        }
        if (focalYInput != null && Number.isFinite(focalYInput)) {
          nextThemeSettings.backgroundFocalY = Math.max(0, Math.min(1, focalYInput));
        }
        const board = await updateBoard(
          req.params.id,
          {
            themeSettings: nextThemeSettings,
            background: url,
          },
          authReq.user.id,
        );
        if (board == null) {
          res.status(404).json({
            error: {
              message: 'Board not found',
              code: 'NOT_FOUND',
              statusCode: 404,
            },
          });
          return;
        }
        res.json({ url, board });
      } catch (error) {
        if (error instanceof Error) {
          res.status(400).json({
            error: {
              message: error.message,
              code: 'BACKGROUND_UPLOAD_FAILED',
              statusCode: 400,
            },
          });
          return;
        }
        next(error);
      }
    },
  );

  router.delete('/:id/background-image', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardDoc = await Board.findById(req.params.id);
      if (boardDoc == null) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      const isOwner = boardDoc.ownerId.toString() === authReq.user.id;
      if (!isOwner) {
        const canChangeTheme = await hasPermission(authReq.user, req.params.id, 'boards.themes.changetheme');
        if (!canChangeTheme) {
          res.status(403).json({
            error: {
              message: 'Insufficient permissions to update board theme/background',
              code: 'FORBIDDEN',
              statusCode: 403,
            },
          });
          return;
        }
      }

      const nextThemeSettings = await hydrateBoardThemeSettings(
        boardDoc.themeSettings,
        authReq.user.id,
      );
      const existingImageUrl =
        nextThemeSettings.backgroundMode === 'image'
          ? nextThemeSettings.backgroundImageUrl?.trim() ?? ''
          : '';
      if (existingImageUrl !== '') {
        await deleteBoardBackgroundByPublicUrl(existingImageUrl);
      }
      delete nextThemeSettings.backgroundImageUrl;
      nextThemeSettings.backgroundMode = 'color';
      if ((nextThemeSettings.backgroundColor?.trim() ?? '') === '') {
        nextThemeSettings.backgroundColor = nextThemeSettings.selectedTheme.palette.canvasBg;
      }
      const board = await updateBoard(
        req.params.id,
        {
          themeSettings: nextThemeSettings,
          background: nextThemeSettings.backgroundColor,
        },
        authReq.user.id,
      );
      if (board == null) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ board });
    } catch (error) {
      next(error);
    }
  });
}
