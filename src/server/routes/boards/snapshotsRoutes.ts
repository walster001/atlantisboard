import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { getBoardKanbanSnapshotForUser } from '../../services/boardService.js';
import { getCardDescriptionFieldsBatchForBoard } from '../../services/cardService.js';
import { boardSnapshotQuerySchema, cardDescriptionsBatchBodySchema } from './schemas.js';

export function registerSnapshotsRoutes(router: Router): void {
  router.get('/:id/kanban-snapshot', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = parseOrThrow(boardSnapshotQuerySchema, req.query);
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
      handleApiRouteError(res, error, next);
    }
  });

  router.post('/:id/cards/descriptions-batch', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = parseOrThrow(cardDescriptionsBatchBodySchema, req.body);
      const cards = await getCardDescriptionFieldsBatchForBoard(boardId, authReq.user.id, body.cardIds);
      res.json({ cards });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
