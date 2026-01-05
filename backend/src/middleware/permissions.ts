import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { PermissionKey } from '../lib/permissions/types.js';
import { permissionService } from '../lib/permissions/service.js';
import { ForbiddenError } from './errorHandler.js';

export function requirePermission(permission: PermissionKey): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      // Extract boardId from params or body
      const boardId = req.params.boardId || req.body.boardId || req.query.boardId as string;

      // Build permission context
      const context = permissionService.buildContext(
        req.user.id,
        req.user.isAdmin,
        boardId,
        undefined // Will be fetched if needed
      );

      // Check permission
      await permissionService.requirePermission(permission, context);
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function requireAnyPermission(...permissions: PermissionKey[]): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const boardId = req.params.boardId || req.body.boardId || req.query.boardId as string;

      const context = permissionService.buildContext(
        req.user.id,
        req.user.isAdmin,
        boardId,
        undefined
      );

      // Check if user has any of the required permissions
      let hasPermission = false;
      for (const permission of permissions) {
        if (await permissionService.checkPermission(permission, context)) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        throw new ForbiddenError(`Permission denied: requires one of ${permissions.join(', ')}`);
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function requireAllPermissions(...permissions: PermissionKey[]): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const boardId = req.params.boardId || req.body.boardId || req.query.boardId as string;

      const context = permissionService.buildContext(
        req.user.id,
        req.user.isAdmin,
        boardId,
        undefined
      );

      // Check if user has all required permissions
      for (const permission of permissions) {
        await permissionService.requirePermission(permission, context);
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

