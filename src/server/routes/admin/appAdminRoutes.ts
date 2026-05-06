import type { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { User } from '../../models/User.js';
import { emitPermissionsUpdated } from './helpers.js';

const setAppAdminSchema = z.object({
  userId: z.string().trim().min(1),
});

const appAdminUserIdSchema = z.string().trim().min(1).max(80);

/**
 * Account that may not revoke their own App Admin (bootstrap / legacy first admin).
 * Prefer active `foundingAppAdmin`; if none, use earliest-created admin when no founding flags exist.
 */
async function resolveBootstrapAppAdminId(): Promise<string | null> {
  const foundingActive = await User.findOne({ foundingAppAdmin: true, isAppAdmin: true })
    .select('_id')
    .lean();
  if (foundingActive) {
    return String(foundingActive._id);
  }
  const hasFoundingRecord = await User.exists({ foundingAppAdmin: true });
  if (hasFoundingRecord) {
    return null;
  }
  const legacy = await User.findOne({ isAppAdmin: true }).sort({ createdAt: 1 }).select('_id').lean();
  return legacy ? String(legacy._id) : null;
}

export function registerAppAdminRoutes(router: Router): void {
  router.get('/app-admins', async (_req, res, next) => {
    try {
      const admins = await User.find({ isAppAdmin: true })
        .select('_id displayName email')
        .sort({ createdAt: 1 })
        .lean();
      const bootstrapAppAdminId = await resolveBootstrapAppAdminId();
      res.json({ appAdmins: admins, bootstrapAppAdminId });
    } catch (error) {
      next(error);
    }
  });

  router.post('/app-admins', async (req, res, next) => {
    try {
      const { userId } = setAppAdminSchema.parse(req.body);
      const user = await User.findById(userId);
      if (!user) {
        res
          .status(404)
          .json({ error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 } });
        return;
      }
      if (!user.isAppAdmin) {
        user.isAppAdmin = true;
        await user.save();
        emitPermissionsUpdated({
          affectedUserIds: [userId],
          reason: 'app_admin.granted',
        });
      }
      res.status(200).json({ appAdmin: { _id: user._id, displayName: user.displayName, email: user.email } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.delete('/app-admins/:userId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = appAdminUserIdSchema.parse(req.params.userId);
      const count = await User.countDocuments({ isAppAdmin: true });
      const user = await User.findById(userId);
      if (!user) {
        res
          .status(404)
          .json({ error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 } });
        return;
      }
      if (userId === authReq.user.id && user.isAppAdmin) {
        const bootstrapId = await resolveBootstrapAppAdminId();
        if (bootstrapId !== null && userId === bootstrapId) {
          res.status(403).json({
            error: {
              message:
                'The bootstrap App Admin cannot remove their own access. Add another App Admin first, then they can remove you if needed.',
              code: 'FORBIDDEN',
              statusCode: 403,
            },
          });
          return;
        }
      }
      if (user.isAppAdmin && count <= 1) {
        res.status(400).json({
          error: {
            message: 'At least one App Admin must remain',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (user.isAppAdmin) {
        user.isAppAdmin = false;
        await user.save();
        emitPermissionsUpdated({
          affectedUserIds: [userId],
          reason: 'app_admin.revoked',
        });
      }
      res.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });
}
