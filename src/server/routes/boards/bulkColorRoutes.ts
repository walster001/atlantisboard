import { type Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/express.js';
import { bulkUpdateListColorsForBoard } from '../../services/listService.js';
import { bulkUpdateCardColorsForBoard } from '../../services/cardService.js';
import { bulkCardColorBodySchema, bulkListColorBodySchema } from './schemas.js';

export function registerBulkColorRoutes(router: Router): void {
  router.patch('/:id/lists/bulk-color', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = bulkListColorBodySchema.parse(req.body);
      const result = await bulkUpdateListColorsForBoard(boardId, body.color, authReq.user.id);
      res.json(result);
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
      if (error instanceof Error && error.message === 'Board not found') {
        res.status(404).json({
          error: { message: 'Board not found', code: 'NOT_FOUND', statusCode: 404 },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('Insufficient permissions')) {
        res.status(403).json({
          error: { message: error.message, code: 'FORBIDDEN', statusCode: 403 },
        });
        return;
      }
      next(error);
    }
  });

  router.patch('/:id/cards/bulk-color', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = bulkCardColorBodySchema.parse(req.body);
      const result = await bulkUpdateCardColorsForBoard(boardId, authReq.user.id, {
        color: body.color,
        listId: body.listId,
      });
      res.json(result);
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
      if (error instanceof Error && error.message === 'Board not found') {
        res.status(404).json({
          error: { message: 'Board not found', code: 'NOT_FOUND', statusCode: 404 },
        });
        return;
      }
      if (error instanceof Error && error.message === 'List not found on board') {
        res.status(400).json({
          error: { message: error.message, code: 'BAD_REQUEST', statusCode: 400 },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('Insufficient permissions')) {
        res.status(403).json({
          error: { message: error.message, code: 'FORBIDDEN', statusCode: 403 },
        });
        return;
      }
      next(error);
    }
  });
}
