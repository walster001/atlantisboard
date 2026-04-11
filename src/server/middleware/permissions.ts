/**
 * Permission middleware for route protection
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { hasPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';

export function requirePermission(
  permission: string,
  resourceType: 'workspace' | 'board',
  resourceIdExtractor: (req: Request) => string | undefined
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        res.status(401).json({
          error: {
            message: 'Authentication required',
            code: 'UNAUTHORIZED',
            statusCode: 401,
          },
        });
        return;
      }

      const resourceId = resourceIdExtractor(req);
      if (!resourceId) {
        res.status(400).json({
          error: {
            message: 'Resource ID is required',
            code: 'MISSING_RESOURCE_ID',
            statusCode: 400,
          },
        });
        return;
      }

      const allowed = await hasPermission(
        authReq.user.id,
        permission,
        resourceId,
        resourceType
      );

      if (!allowed) {
        logger.warn(
          {
            userId: authReq.user.id,
            permission,
            resourceType,
            resourceId,
          },
          'Permission denied'
        );
        res.status(403).json({
          error: {
            message: 'Insufficient permissions',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Error in permission middleware');
      res.status(500).json({
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          statusCode: 500,
        },
      });
    }
  };
}

