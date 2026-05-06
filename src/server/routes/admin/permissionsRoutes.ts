import type { Router } from 'express';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { PermissionSet } from '../../models/PermissionSet.js';
import { logAuditEvent } from '../../utils/auditLogger.js';

export function registerPermissionsRoutes(router: Router): void {
  router.get('/permission-sets', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const permissionSets = await PermissionSet.find({ createdBy: authReq.user.id }).sort({
        createdAt: -1,
      });
      res.json({ permissionSets });
    } catch (error) {
      next(error);
    }
  });

  router.post('/permission-sets', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { name, description, permissions } = req.body;

      if (!name || !Array.isArray(permissions)) {
        res.status(400).json({
          error: {
            message: 'Name and permissions array are required',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      const permissionSet = new PermissionSet({
        name,
        description,
        permissions,
        createdBy: authReq.user.id,
      });

      await permissionSet.save();

      logAuditEvent({
        userId: authReq.user.id,
        action: 'permission_set.create',
        resourceType: 'permission_set',
        resourceId: permissionSet._id.toString(),
        timestamp: new Date(),
      });

      res.status(201).json({ permissionSet });
    } catch (error) {
      next(error);
    }
  });
}
