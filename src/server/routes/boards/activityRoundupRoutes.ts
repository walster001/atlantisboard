import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { sendManualBoardActivityRoundup } from '../../services/boardActivityWeeklyRoundupService.js';

export function registerActivityRoundupRoutes(router: Router): void {
  router.post('/:id/activity-roundup/send', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await sendManualBoardActivityRoundup(req.params.id, authReq.user.id);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
