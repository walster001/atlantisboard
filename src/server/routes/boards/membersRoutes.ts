import { type Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import { User } from '../../models/User.js';
import { RoleDefinition } from '../../models/RoleDefinition.js';
import {
  addBoardMember,
  getBoardMembersPage,
  removeBoardMember,
  updateBoardMemberRole,
} from '../../services/boardService.js';
import { isBuiltInRoleKey, isValidCustomRoleKey } from '../../services/roleService.js';
import { boardMembersQuerySchema } from './schemas.js';

export function registerMembersListRoute(router: Router): void {
  router.get('/:id/members', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = boardMembersQuerySchema.parse(req.query);
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
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      next(error);
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
      if (error instanceof Error && (error.message.includes('permissions') || error.message.includes('already'))) {
        res.status(400).json({
          error: {
            message: error.message,
            code: error.message.includes('permissions') ? 'FORBIDDEN' : 'CONFLICT',
            statusCode: error.message.includes('permissions') ? 403 : 409,
          },
        });
        return;
      }
      next(error);
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
      if (error instanceof Error && (error.message.includes('permissions') || error.message.includes('owner'))) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      next(error);
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
      if (
        error instanceof Error &&
        (error.message.includes('permissions') ||
          error.message.includes('owner') ||
          error.message.includes('not found'))
      ) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      next(error);
    }
  });
}
