import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { reorderBoardsInHomeScope } from '../../services/boardService.js';
import { reorderBoardsSchema } from './schemas.js';

export function registerReorderRoutes(router: Router): void {
  router.put('/reorder', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(reorderBoardsSchema, req.body);
      const workspaceId = validated.workspaceId;
      await reorderBoardsInHomeScope(authReq.user.id, workspaceId, validated.orderedBoardIds);
      res.json({ message: 'Board order updated' });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
