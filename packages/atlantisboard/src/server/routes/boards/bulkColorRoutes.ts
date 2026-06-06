import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { bulkUpdateListColorsForBoard } from '../../services/listService.js';
import { bulkUpdateCardColorsForBoard } from '../../services/cardService.js';
import { bulkCardColorBodySchema, bulkListColorBodySchema } from './schemas.js';

export function registerBulkColorRoutes(router: Router): void {
  router.patch('/:id/lists/bulk-color', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = parseOrThrow(bulkListColorBodySchema, req.body);
      const result = await bulkUpdateListColorsForBoard(boardId, body.color, authReq.user.id);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.patch('/:id/cards/bulk-color', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const body = parseOrThrow(bulkCardColorBodySchema, req.body);
      const result = await bulkUpdateCardColorsForBoard(boardId, authReq.user.id, {
        color: body.color,
        listId: body.listId,
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
