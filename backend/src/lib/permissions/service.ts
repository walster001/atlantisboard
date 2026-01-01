/**
 * Permission Service
 * 
 * Handles permission checking logic for the backend.
 * Supports both default role-based permissions and custom role permissions.
 */

import { prisma } from '../../db/client.js';
import { PermissionKey, PermissionContext, BoardRole } from './types.js';
import { DEFAULT_ROLE_PERMISSIONS, APP_ADMIN_PERMISSIONS, isAppPermission } from './registry.js';
import { ForbiddenError } from '../../middleware/errorHandler.js';

class PermissionService {
  /**
   * Get user's board role
   */
  async getBoardRole(userId: string, boardId: string): Promise<BoardRole | null> {
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
      include: {
        customRole: {
          include: {
            permissions: true,
          },
        },
      },
    });

    return membership?.role ?? null;
  }

  /**
   * Get custom role permissions for a user on a board
   */
  async getCustomRolePermissions(userId: string, boardId: string): Promise<Set<PermissionKey>> {
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
      include: {
        customRole: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!membership?.customRole) {
      return new Set();
    }

    return new Set(membership.customRole.permissions.map((p) => p.permissionKey as PermissionKey));
  }

  /**
   * Check if user has a specific permission
   */
  async checkPermission(
    permission: PermissionKey,
    context: PermissionContext
  ): Promise<boolean> {
    const { userId, isAppAdmin, boardId, boardRole } = context;

    // App-level permissions require isAppAdmin flag
    if (isAppPermission(permission)) {
      return isAppAdmin;
    }

    // Board-level permissions require board context
    if (!boardId) {
      return false;
    }

    // App admins have all permissions
    if (isAppAdmin) {
      return true;
    }

    // Get user's board membership
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
      include: {
        customRole: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!membership) {
      return false;
    }

    // Check custom role permissions first
    if (membership.customRole) {
      const customPermissions = new Set(
        membership.customRole.permissions.map((p) => p.permissionKey as PermissionKey)
      );
      if (customPermissions.has(permission)) {
        return true;
      }
    }

    // Fall back to default role permissions
    const role = membership.role;
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role];
    return defaultPermissions.has(permission);
  }

  /**
   * Require permission (throws ForbiddenError if not granted)
   */
  async requirePermission(
    permission: PermissionKey,
    context: PermissionContext
  ): Promise<void> {
    const hasPermission = await this.checkPermission(permission, context);
    if (!hasPermission) {
      throw new ForbiddenError(`Permission denied: ${permission}`);
    }
  }

  /**
   * Get all permissions for a user in a board context
   */
  async getUserPermissions(context: PermissionContext): Promise<Set<PermissionKey>> {
    const { userId, isAppAdmin, boardId } = context;
    const permissions = new Set<PermissionKey>();

    // Add app-level permissions if user is app admin
    if (isAppAdmin) {
      APP_ADMIN_PERMISSIONS.forEach((perm) => permissions.add(perm));
    }

    // Add board-level permissions if board context is provided
    if (boardId) {
      const membership = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
        include: {
          customRole: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (membership) {
        // Add custom role permissions
        if (membership.customRole) {
          membership.customRole.permissions.forEach((p) => {
            permissions.add(p.permissionKey as PermissionKey);
          });
        } else {
          // Add default role permissions
          const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[membership.role];
          defaultPermissions.forEach((perm) => permissions.add(perm));
        }
      }

      // App admins get all board permissions
      if (isAppAdmin) {
        // Add all board-level permissions
        Object.values(DEFAULT_ROLE_PERMISSIONS.admin).forEach((perm) => {
          if (!isAppPermission(perm)) {
            permissions.add(perm);
          }
        });
      }
    }

    return permissions;
  }

  /**
   * Build permission context from request
   */
  buildContext(
    userId: string,
    isAppAdmin: boolean,
    boardId?: string,
    boardRole?: BoardRole | null
  ): PermissionContext {
    return {
      userId,
      isAppAdmin,
      boardId,
      boardRole,
    };
  }
}

export const permissionService = new PermissionService();

