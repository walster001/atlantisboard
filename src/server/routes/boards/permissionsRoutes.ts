import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { RoleDefinition } from '../../models/RoleDefinition.js';
import { Board } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import {
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
} from '../../services/roleService.js';
import { hasPermission } from '../../utils/permissions.js';
import { resolveBoardRoleUpdateModeForActor } from './helpers.js';

const permissionProbeKeys = [
  'boards.view',
  'boards.update',
  'boards.settings.update',
  'boards.themes.changetheme',
  'boards.themes.customtheme',
  'boards.members.view',
  'boards.members.add',
  'boards.members.remove',
  'boards.members.role.update',
  'invites.create',
  'invites.view',
  'invites.delete',
  'labels.create',
  'labels.update',
  'labels.delete',
  'lists.create',
  'lists.update',
  'lists.delete',
  'lists.reorder',
  'lists.duplicate',
  'comments.create',
  'comments.delete',
  'cards.create',
  'cards.update',
  'cards.delete',
  'cards.duplicate',
  'cards.move',
  'cards.reorder',
  'cards.dates.start.edit',
  'cards.dates.due.edit',
  'cards.dates.end.edit',
  'export.board.csv',
  'export.board.trello',
  'export.board.wekan',
  'export.board.atlantisboard',
] as const;

export function registerPermissionsRoutes(router: Router): void {
  router.get('/:id/permissions/me', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const allowed: string[] = [];
      for (const key of permissionProbeKeys) {
        if (await hasPermission(authReq.user, boardId, key)) {
          allowed.push(key);
        }
      }
      res.json({ boardId, permissions: allowed, serverTs: Date.now() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/roles', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = req.params.id;
      const allowed = await hasPermission(authReq.user, boardId, 'boards.members.view');
      if (!allowed) {
        res.status(403).json({
          error: {
            message: 'Insufficient permissions to view roles',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      const board = await Board.findById(boardId).select('ownerId workspaceId members.userId members.roleKey').lean();
      if (!board) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      const roles = await RoleDefinition.find()
        .sort({ isBuiltIn: -1, key: 1 })
        .select('key displayName isBuiltIn hierarchyLevel')
        .lean();

      const userId = authReq.user.id;
      if (String(board.ownerId) === userId) {
        res.json({
          roles: roles.map((r) => ({ key: r.key, displayName: r.displayName, isBuiltIn: r.isBuiltIn })),
        });
        return;
      }

      let actorRoleKey: string | null = null;
      const boardMember = (board.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
        (m) => String(m.userId) === userId,
      );
      if (typeof boardMember?.roleKey === 'string' && boardMember.roleKey.trim() !== '') {
        actorRoleKey = boardMember.roleKey.trim();
      } else if (board.workspaceId != null) {
        const workspace = await Workspace.findById(board.workspaceId).select('ownerId members.userId members.roleKey').lean();
        if (workspace) {
          if (String(workspace.ownerId) === userId) {
            actorRoleKey = 'admin';
          } else {
            const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
              (m) => String(m.userId) === userId,
            );
            if (typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== '') {
              actorRoleKey = wsMember.roleKey.trim();
            }
          }
        }
      }

      if (actorRoleKey == null) {
        res.json({ roles: [] });
        return;
      }

      const actorLevel = await getRoleHierarchyLevel(actorRoleKey);
      const mode = await resolveBoardRoleUpdateModeForActor(userId, boardId);
      if (actorLevel == null || mode == null) {
        res.json({ roles: [] });
        return;
      }

      const filtered: Array<{ key: string; displayName: string; isBuiltIn: boolean }> = [];
      for (const role of roles) {
        const isActorOwnRoleKey = role.key === actorRoleKey;
        const level =
          typeof role.hierarchyLevel === 'number' && Number.isFinite(role.hierarchyLevel)
            ? role.hierarchyLevel
            : await getRoleHierarchyLevel(role.key);
        if (isActorOwnRoleKey) {
          filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
          continue;
        }
        if (level == null) {
          continue;
        }
        if (mode !== 'boards.members.role.update.any' && level > actorLevel) {
          continue;
        }
        const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
          mode,
          actorLevel,
          targetCurrentLevel: level,
          targetNextLevel: level,
          selfChange: false,
        });
        if (!allowedByMode) {
          continue;
        }
        filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
      }

      res.json({ roles: filtered });
    } catch (error) {
      next(error);
    }
  });
}
