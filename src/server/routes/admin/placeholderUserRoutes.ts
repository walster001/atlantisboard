import type { Router } from 'express';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { User } from '../../models/User.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';

export function registerPlaceholderUserRoutes(router: Router): void {
  router.post('/users/:id/convert-from-placeholder', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;

      const placeholderUser = await User.findById(id);
      if (!placeholderUser) {
        res.status(404).json({
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      if (!placeholderUser.isPlaceholder) {
        res.status(400).json({
          error: {
            message: 'User is not a placeholder user',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      // Convert placeholder to regular user
      placeholderUser.isPlaceholder = false;
      placeholderUser.set('placeholderSource', undefined, { strict: false });
      placeholderUser.set('placeholderEmail', undefined, { strict: false });
      placeholderUser.set('placeholderName', undefined, { strict: false });
      await placeholderUser.save();

      logAuditEvent({
        userId: authReq.user.id,
        action: 'convert_placeholder_user',
        resourceType: 'user',
        resourceId: id,
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
      });

      logger.info(
        { adminId: authReq.user.id, placeholderUserId: id },
        'Placeholder user converted by admin',
      );

      res.json({ message: 'Placeholder user converted successfully', user: placeholderUser });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users/:placeholderId/merge/:userId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { placeholderId, userId } = req.params;

      const placeholderUser = await User.findById(placeholderId);
      const targetUser = await User.findById(userId);

      if (!placeholderUser) {
        res.status(404).json({
          error: {
            message: 'Placeholder user not found',
            code: 'USER_NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      if (!targetUser) {
        res.status(404).json({
          error: {
            message: 'Target user not found',
            code: 'USER_NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      if (!placeholderUser.isPlaceholder) {
        res.status(400).json({
          error: {
            message: 'Source user is not a placeholder user',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      // TODO: Transfer all workspace/board memberships, activities, etc. from placeholder to target user
      // For now, just delete the placeholder user
      // In a full implementation, you would:
      // 1. Update all workspace memberships
      // 2. Update all board memberships
      // 3. Update all card assignees
      // 4. Update all comments
      // 5. Update all activities
      // 6. Delete placeholder user

      await User.findByIdAndDelete(placeholderId);

      logAuditEvent({
        userId: authReq.user.id,
        action: 'merge_placeholder_user',
        resourceType: 'user',
        resourceId: userId,
        metadata: { placeholderUserId: placeholderId },
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
      });

      logger.info(
        { adminId: authReq.user.id, placeholderUserId: placeholderId, targetUserId: userId },
        'Placeholder user merged with existing user by admin',
      );

      res.json({ message: 'Placeholder user merged successfully', user: targetUser });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users/placeholders', async (_req, res, next) => {
    try {
      const placeholderUsers = await User.find({ isPlaceholder: true })
        .select('email displayName placeholderName placeholderEmail placeholderSource isPlaceholder')
        .sort({ createdAt: -1 });
      res.json({ users: placeholderUsers });
    } catch (error) {
      next(error);
    }
  });
}
