import type { Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { User } from '../../models/User.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';

export function registerUserSecurityRoutes(router: Router): void {
  router.post('/users/:id/unlock', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;

      const targetUser = await User.findById(id);
      if (!targetUser) {
        res.status(404).json({
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      targetUser.failedLoginAttempts = 0;
      delete targetUser.lockedUntil;
      await targetUser.save();

      logAuditEvent({
        userId: authReq.user.id,
        action: 'unlock_account',
        resourceType: 'user',
        resourceId: id,
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
      });

      logger.info({ adminId: authReq.user.id, targetUserId: id }, 'Account unlocked by admin');

      res.json({ message: 'Account unlocked successfully' });
    } catch (error) {
      next(error);
    }
  });
}
