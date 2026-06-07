import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { addCardAssignee, removeCardAssignee } from '../../services/cardService.js';
import {
  cardAssigneeBodySchema,
  cardAssigneeUserIdParamSchema,
  handleCardRouteError,
  parseOrThrow,
} from './_helpers.js';

export function registerCardAssigneesRoutes(router: Router): void {
  router.post('/:id/assignees', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = parseOrThrow(cardAssigneeBodySchema, req.body);
      const card = await addCardAssignee(req.params.id, userId, authReq.user.id);
      if (!card) {
        res.status(404).json({
          error: {
            message: 'Card not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ card });
    } catch (error) {
      handleCardRouteError(res, error, next);
    }
  });

  router.delete('/:id/assignees/:userId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = parseOrThrow(cardAssigneeUserIdParamSchema, req.params.userId);
      const card = await removeCardAssignee(req.params.id, userId, authReq.user.id);
      if (!card) {
        res.status(404).json({
          error: {
            message: 'Card not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ card });
    } catch (error) {
      handleCardRouteError(res, error, next);
    }
  });
}
