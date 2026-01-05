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
        customRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
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
        customRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!membership?.customRoles || membership.customRoles.length === 0) {
      return new Set();
    }

    // Aggregate permissions from all custom roles
    const allPermissions = new Set<PermissionKey>();
    for (const customRoleAssignment of membership.customRoles) {
      customRoleAssignment.role.permissions.forEach((p: { permissionKey: string }) => {
        allPermissions.add(p.permissionKey as PermissionKey);
      });
    }
    return allPermissions;
  }

  /**
   * Check if user has a specific permission
   */
  async checkPermission(
    permission: PermissionKey,
    context: PermissionContext
  ): Promise<boolean> {
    const { userId, isAppAdmin, boardId } = context;

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
        customRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return false;
    }

    // Check custom role permissions first
    if (membership.customRoles && membership.customRoles.length > 0) {
      const customPermissions = new Set<PermissionKey>();
      for (const customRoleAssignment of membership.customRoles) {
        customRoleAssignment.role.permissions.forEach((p: { permissionKey: string }) => {
          customPermissions.add(p.permissionKey as PermissionKey);
        });
      }
      if (customPermissions.has(permission)) {
        return true;
      }
    }

    // Fall back to default role permissions
    const role: BoardRole = membership.role;
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:163',message:'getUserPermissions entry',data:{userId,isAppAdmin,boardId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Add app-level permissions if user is app admin
    if (isAppAdmin) {
      APP_ADMIN_PERMISSIONS.forEach((perm) => permissions.add(perm));
    }

    // Add board-level permissions if board context is provided
    if (boardId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:174',message:'Before prisma query',data:{boardId,userId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      const membership = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
        include: {
          customRoles: {
            include: {
              role: {
                include: {
                  permissions: true,
                },
              },
            },
          },
        },
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:190',message:'After prisma query',data:{membershipExists:!!membership,hasCustomRoles:!!membership?.customRoles,customRolesLength:membership?.customRoles?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (membership) {
        // Add custom role permissions
        if (membership.customRoles && membership.customRoles.length > 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:193',message:'Processing custom roles',data:{customRolesCount:membership.customRoles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
          // #endregion

          for (const customRoleAssignment of membership.customRoles) {
            customRoleAssignment.role.permissions.forEach((p: { permissionKey: string }) => {
              permissions.add(p.permissionKey as PermissionKey);
            });
          }
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:199',message:'Using default role permissions',data:{role:membership.role},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'E'})}).catch(()=>{});
          // #endregion

          // Add default role permissions
          const role: BoardRole = membership.role;
          const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role];
          defaultPermissions.forEach((perm: PermissionKey) => permissions.add(perm));
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'service.ts:217',message:'getUserPermissions exit',data:{permissionsCount:permissions.size},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

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
    const context: PermissionContext = {
      userId,
      isAppAdmin,
      ...(boardId !== undefined && { boardId }),
      ...(boardRole !== undefined && { boardRole }),
    };
    return context;
  }
}

export const permissionService = new PermissionService();

