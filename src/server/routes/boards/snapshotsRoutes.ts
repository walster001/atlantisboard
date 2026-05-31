import { type Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/express.js';
import { getBoardKanbanSnapshotForUser } from '../../services/boardService.js';
import { getCardDescriptionFieldsBatchForBoard } from '../../services/cardService.js';
import { boardSnapshotQuerySchema, cardDescriptionsBatchBodySchema } from './schemas.js';

export function registerSnapshotsRoutes(router: Router): void {
  router.get('/:id/kanban-snapshot', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = boardSnapshotQuerySchema.parse(req.query);
      const snapshotOptions =
        query.listLimit !== undefined ? { listLimit: query.listLimit } : undefined;
      const snapshot = await getBoardKanbanSnapshotForUser(
        req.params.id,
        authReq.user.id,
        snapshotOptions,
      );
      if (!snapshot) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json(snapshot);
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
      next(error);
    }
  });

  router.post('/:id/cards/descriptions-batch', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = cardDescriptionsBatchBodySchema.parse(req.body);
      const cards = await getCardDescriptionFieldsBatchForBoard(boardId, authReq.user.id, body.cardIds);
      res.json({ cards });
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
}
