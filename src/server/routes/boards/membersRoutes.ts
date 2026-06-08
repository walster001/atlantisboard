import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { User } from '../../models/User.js';
import { RoleDefinition } from '../../models/RoleDefinition.js';
import {
  addBoardMember,
  getBoardMembersPage,
  removeBoardMember,
  updateBoardMemberRole,
} from '../../services/boardService.js';
import { updateBoardImportPlaceholderRole } from '../../services/boardImportPlaceholderService.js';
import { discardAllUnmappedPlaceholdersOnBoard } from '../../services/importPlaceholderUserService.js';
import { isBuiltInRoleKey, isValidCustomRoleKey } from '../../services/roleService.js';
import { boardMembersQuerySchema } from './schemas.js';

export function registerMembersListRoute(router: Router): void {
  router.get('/:id/members', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = parseOrThrow(boardMembersQuerySchema, req.query);
      const options: {
        q?: string;
        sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
        cursor?: string;
        limit?: number;
      } = {};
      if (query.q !== undefined) options.q = query.q;
      if (query.sort !== undefined) options.sort = query.sort;
      if (query.cursor !== undefined) options.cursor = query.cursor;
      if (query.limit !== undefined) options.limit = query.limit;
      const result = await getBoardMembersPage(req.params.id, authReq.user.id, options);
      if (!result) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}

export function registerMemberManagementRoutes(router: Router): void {
  router.post('/:id/members', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId, role, roleKey } = req.body as { userId?: unknown; role?: unknown; roleKey?: unknown };
      const roleKeyCandidate =
        typeof roleKey === 'string' && roleKey.trim() !== ''
          ? roleKey.trim()
          : typeof role === 'string'
            ? role
            : '';
      if (!userId || typeof userId !== 'string' || roleKeyCandidate === '') {
        res.status(400).json({
          error: {
            message: 'Invalid request body',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (!(isBuiltInRoleKey(roleKeyCandidate) || isValidCustomRoleKey(roleKeyCandidate))) {
        res.status(400).json({
          error: {
            message: 'Invalid roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (isValidCustomRoleKey(roleKeyCandidate)) {
        const exists = await RoleDefinition.findOne({ key: roleKeyCandidate }).select('_id').lean();
        if (!exists) {
          res.status(400).json({
            error: {
              message: 'Unknown roleKey',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
      }
      const targetUser = await User.findById(userId).select('displayName').lean();
      const targetDisplayName =
        targetUser?.displayName != null && targetUser.displayName.trim() !== ''
          ? targetUser.displayName.trim()
          : 'Unknown user';
      const board = await addBoardMember(req.params.id, userId, roleKeyCandidate, authReq.user.id, {
        targetDisplayName,
      });
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
      res.json({ board });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.delete('/:id/members/:memberId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const removedUser = await User.findById(req.params.memberId).select('displayName').lean();
      const targetDisplayName =
        removedUser?.displayName != null && removedUser.displayName.trim() !== ''
          ? removedUser.displayName.trim()
          : 'Unknown user';
      const board = await removeBoardMember(
        req.params.id,
        req.params.memberId,
        authReq.user.id,
        { targetDisplayName },
      );
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
      res.json({ board });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.put('/:id/members/:memberId/role', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { role, roleKey } = req.body as { role?: unknown; roleKey?: unknown };
      const roleKeyCandidate =
        typeof roleKey === 'string' && roleKey.trim() !== ''
          ? roleKey.trim()
          : typeof role === 'string'
            ? role
            : '';
      if (roleKeyCandidate === '') {
        res.status(400).json({
          error: {
            message: 'Invalid roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (!(isBuiltInRoleKey(roleKeyCandidate) || isValidCustomRoleKey(roleKeyCandidate))) {
        res.status(400).json({
          error: {
            message: 'Invalid roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (isValidCustomRoleKey(roleKeyCandidate)) {
        const exists = await RoleDefinition.findOne({ key: roleKeyCandidate }).select('_id').lean();
        if (!exists) {
          res.status(400).json({
            error: {
              message: 'Unknown roleKey',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
      }
      const memberUser = await User.findById(req.params.memberId).select('displayName').lean();
      const targetDisplayName =
        memberUser?.displayName != null && memberUser.displayName.trim() !== ''
          ? memberUser.displayName.trim()
          : 'Unknown user';
      const board = await updateBoardMemberRole(
        req.params.id,
        req.params.memberId,
        roleKeyCandidate,
        authReq.user.id,
        { targetDisplayName },
      );
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
      res.json({ board });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.put('/:id/placeholders/:placeholderId/role', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { role, roleKey } = req.body as { role?: unknown; roleKey?: unknown };
      const roleKeyCandidate =
        typeof roleKey === 'string' && roleKey.trim() !== ''
          ? roleKey.trim()
          : typeof role === 'string'
            ? role
            : '';
      if (roleKeyCandidate === '') {
        res.status(400).json({
          error: {
            message: 'Invalid roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (!(isBuiltInRoleKey(roleKeyCandidate) || isValidCustomRoleKey(roleKeyCandidate))) {
        res.status(400).json({
          error: {
            message: 'Invalid roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (isValidCustomRoleKey(roleKeyCandidate)) {
        const exists = await RoleDefinition.findOne({ key: roleKeyCandidate }).select('_id').lean();
        if (!exists) {
          res.status(400).json({
            error: {
              message: 'Unknown roleKey',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
      }
      await updateBoardImportPlaceholderRole({
        boardId: req.params.id,
        placeholderId: req.params.placeholderId,
        actorUserId: authReq.user.id,
        roleKey: roleKeyCandidate,
      });
      res.json({ roleKey: roleKeyCandidate });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.post('/:id/placeholders/discard', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await discardAllUnmappedPlaceholdersOnBoard(req.params.id, authReq.user.id);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
