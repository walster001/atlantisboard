import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from '../../services/workspaceService.js';
import { hasPermission } from '../../utils/permissions.js';
import { RoleDefinition } from '../../models/RoleDefinition.js';
import { getRoleHierarchyLevel, isBuiltInRoleKey, isValidCustomRoleKey } from '../../services/roleService.js';
import { Workspace } from '../../models/Workspace.js';
import { searchRegisteredUsers } from '../../services/userDirectoryService.js';
import { addMemberSchema } from './_helpers.js';

const router = Router();

/** Paginated user directory for “add member” (no search `q` — uses bounded name scan). */
router.get('/:id/member-candidates', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.params.id;
    const allowed = await hasPermission(
      authReq.user.id,
      workspaceId,
      'workspaces.members.add',
      'workspace',
    );
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to list member candidates',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    const workspace = await Workspace.findById(workspaceId).select('ownerId members.userId').lean();
    if (!workspace) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    const excludeUserIds = [
      String(workspace.ownerId),
      ...((workspace.members as Array<{ userId: unknown }> | undefined) ?? []).map((m) =>
        String(m.userId),
      ),
    ];
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 80;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
    const result = await searchRegisteredUsers({
      query: '',
      limit,
      excludeUserIds,
      ...(cursor !== '' ? { cursor } : {}),
    });
    res.json({
      users: result.users,
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/roles', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.params.id;
    const allowed = await hasPermission(
      authReq.user.id,
      workspaceId,
      'workspaces.members.view',
      'workspace',
    );
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
    const workspace = await Workspace.findById(workspaceId).select('ownerId members.userId members.roleKey').lean();
    if (!workspace) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
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
    if (String(workspace.ownerId) === userId) {
      res.json({
        roles: roles.map((r) => ({ key: r.key, displayName: r.displayName, isBuiltIn: r.isBuiltIn })),
      });
      return;
    }

    const canUpdateRoles = await hasPermission(userId, workspaceId, 'workspaces.members.role.update', 'workspace');
    if (!canUpdateRoles) {
      res.json({ roles: [] });
      return;
    }

    const member = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
      (m) => String(m.userId) === userId,
    );
    const actorRoleKey =
      typeof member?.roleKey === 'string' && member.roleKey.trim() !== '' ? member.roleKey.trim() : null;
    if (actorRoleKey == null) {
      res.json({ roles: [] });
      return;
    }

    const actorLevel = await getRoleHierarchyLevel(actorRoleKey);
    if (actorLevel == null) {
      res.json({ roles: [] });
      return;
    }

    const filtered: Array<{ key: string; displayName: string; isBuiltIn: boolean }> = [];
    for (const role of roles) {
      // Always include the member's own role so the settings list can show their current assignment.
      if (role.key === actorRoleKey) {
        filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
        continue;
      }
      const level =
        typeof role.hierarchyLevel === 'number' && Number.isFinite(role.hierarchyLevel)
          ? role.hierarchyLevel
          : await getRoleHierarchyLevel(role.key);
      if (level == null || level > actorLevel) {
        continue;
      }
      filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
    }

    res.json({ roles: filtered });
  } catch (error) {
    next(error);
  }
});

// Add member to workspace
router.post('/:id/members', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = addMemberSchema.parse(req.body);
    const roleKeyCandidate =
      typeof validated.roleKey === 'string' && validated.roleKey.trim() !== ''
        ? validated.roleKey.trim()
        : (validated.role ?? 'viewer');
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
    const workspace = await addWorkspaceMember(
      req.params.id,
      { userId: validated.userId, roleKey: roleKeyCandidate },
      authReq.user.id,
    );
    if (!workspace) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ workspace });
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
    if (error instanceof Error) {
      if (error.message.includes('permissions') || error.message.includes('already')) {
        res.status(400).json({
          error: {
            message: error.message,
            code: error.message.includes('permissions') ? 'FORBIDDEN' : 'CONFLICT',
            statusCode: error.message.includes('permissions') ? 403 : 409,
          },
        });
        return;
      }
    }
    next(error);
  }
});

// Remove member from workspace
router.delete('/:id/members/:memberId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspace = await removeWorkspaceMember(req.params.id, req.params.memberId, authReq.user.id);
    if (!workspace) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ workspace });
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

// Update member role
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
    const workspace = await updateWorkspaceMemberRole(
      req.params.id,
      req.params.memberId,
      roleKeyCandidate,
      authReq.user.id,
    );
    if (!workspace) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ workspace });
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

export { router as workspaceMembersRoutes };
