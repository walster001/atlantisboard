/**
 * Board Import Routes - Wekan Board Import
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { boardImportService } from '../services/board-import.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const importBoardSchema = z.object({
  wekanData: z.any(), // Wekan board data (can be single board or array)
  defaultCardColor: z.string().nullable().optional(),
});

/**
 * POST /api/boards/import
 * Import Wekan board(s)
 * Supports SSE streaming via ?stream=true query parameter
 */
router.post('/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check admin permission
    const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false);
    await permissionService.requirePermission('app.admin.access', context);

    const validated = importBoardSchema.parse(req.body);
    const { wekanData, defaultCardColor } = validated;

    if (!wekanData) {
      throw new ValidationError('No Wekan data provided');
    }

    // Check if streaming is requested
    const useStreaming = req.query.stream === 'true';

    // If streaming is enabled, use SSE
    if (useStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      const sendProgress = (update: any) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      const sendResult = (result: any) => {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
      };

      try {
        await boardImportService.importWekanBoard(
          req.userId!,
          wekanData,
          defaultCardColor || null,
          sendProgress,
          sendResult
        );
      } catch (error: any) {
        sendResult({
          type: 'result',
          success: false,
          errors: [error.message || 'An unexpected error occurred'],
          workspaces_created: 0,
          boards_created: 0,
          columns_created: 0,
          cards_created: 0,
          labels_created: 0,
          subtasks_created: 0,
          warnings: [],
        });
      }
    } else {
      // Non-streaming fallback
      const result = await boardImportService.importWekanBoard(
        req.userId!,
        wekanData,
        defaultCardColor || null
      );
      res.json(result);
    }
  } catch (error) {
    next(error);
  }
});

export default router;

