/**
 * Permission Middleware
 * 
 * Middleware for protecting routes with permission checks.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { PermissionKey } from '../lib/permissions/types.js';
import { permissionService } from '../lib/permissions/service.js';
import { ForbiddenError } from './errorHandler.js';

/**
 * Middleware factory to require a specific permission
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory to require any of the given permissions
 */
export function requireAnyPermission(...permissions: PermissionKey[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory to require all of the given permissions
 */
export function requireAllPermissions(...permissions: PermissionKey[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    } catch (error) {
      next(error);
    }
  };
}

