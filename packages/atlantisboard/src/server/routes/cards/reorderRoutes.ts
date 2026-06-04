import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { reorderCards } from '../../services/cardService.js';
import { handleCardRouteError, reorderCardsBulkReflowSchema } from './_helpers.js';

export function registerCardReorderRoutes(router: Router): void {
  // Deprecated for interactive DnD; reserved for admin/bulk list reflow operations.
  // Must be registered before PUT /:id or "reorder" is parsed as a card id.
  router.put('/reorder', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { listId, cardIds, mode } = reorderCardsBulkReflowSchema.parse(req.body);

      const success = await reorderCards(listId, cardIds, authReq.user.id, { mode });
      if (!success) {
        res.status(404).json({
          error: {
            message: 'List not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      res.json({
        message: 'Cards reordered successfully (bulk reflow mode)',
        listId: String(listId),
        orderedCardIds: [...cardIds].map((id: unknown) => String(id)),
        mode,
        deprecatedForInteractiveDnD: true,
      });
    } catch (error) {
      handleCardRouteError(res, error, next);
    }
  });
}
