import { type Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { reorderBoardsInHomeScope } from '../../services/boardService.js';
import { reorderBoardsSchema } from './schemas.js';

export function registerReorderRoutes(router: Router): void {
  router.put('/reorder', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = reorderBoardsSchema.parse(req.body);
      const workspaceId = validated.workspaceId;
      await reorderBoardsInHomeScope(authReq.user.id, workspaceId, validated.orderedBoardIds);
      res.json({ message: 'Board order updated' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('Invalid')) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'INVALID_REORDER',
            statusCode: 400,
          },
        });
        return;
      }
      next(error);
    }
  });
}
