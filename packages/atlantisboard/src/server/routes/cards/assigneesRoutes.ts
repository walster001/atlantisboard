import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { addCardAssignee, removeCardAssignee } from '../../services/cardService.js';
import { handleCardRouteError } from './_helpers.js';

export function registerCardAssigneesRoutes(router: Router): void {
  router.post('/:id/assignees', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = req.body;
      if (!userId || typeof userId !== 'string') {
        res.status(400).json({
          error: {
            message: 'userId is required',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
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
      const card = await removeCardAssignee(req.params.id, req.params.userId, authReq.user.id);
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
