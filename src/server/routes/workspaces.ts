import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import {
  createWorkspace,
  getWorkspaceById,
  getUserWorkspaces,
  updateWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  deleteWorkspace,
} from '../services/workspaceService.js';
import { hasPermission } from '../utils/permissions.js';
import { RoleDefinition } from '../models/RoleDefinition.js';
import { getRoleHierarchyLevel, isBuiltInRoleKey, isValidCustomRoleKey } from '../services/roleService.js';
import { Workspace } from '../models/Workspace.js';
import { searchRegisteredUsers } from '../services/userDirectoryService.js';

const router = Router();

// All routes require authentication
router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  activityLogRetentionDays: z.number().min(1).max(365).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  roleKey: z.string().trim().min(1).max(80).optional(),
});

const workspaceViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
});

function selectFields(items: unknown[], fieldsCsv: string | undefined): unknown[] {
  if (fieldsCsv === undefined || fieldsCsv.trim() === '') {
    return items;
  }
  const fields = fieldsCsv
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '');
  if (fields.length === 0) {
    return items;
  }
  return items.map((item) => {
    if (item == null || typeof item !== 'object') {
      return item;
    }
    const obj = item as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in obj) {
        selected[field] = obj[field];
      }
    }
    if ('id' in obj) {
      selected.id = obj.id;
    }
    return selected;
  });
}

// Create workspace
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createWorkspaceSchema.parse(req.body);
    const workspace = await createWorkspace({
      ...validated,
      ownerId: authReq.user.id,
    });

    res.status(201).json({ workspace });
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

// Get user's workspaces
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = workspaceViewQuerySchema.parse(req.query);
    const options = query.view !== undefined ? { view: query.view } : undefined;
    const workspaces = await getUserWorkspaces(authReq.user.id, options);
    const responseWorkspaces =
      query.view === 'summary' ? selectFields(workspaces, query.fields) : workspaces;
    res.json({ workspaces: responseWorkspaces });
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

router.get('/:id/permissions/me', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.params.id;
    const workspace = await getWorkspaceById(workspaceId, authReq.user.id, { view: 'summary' });
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
    const keys = [
      'workspaces.view',
      'workspaces.update',
      'workspaces.members.view',
      'workspaces.members.add',
      'workspaces.members.remove',
      'workspaces.members.role.update',
      'boards.create',
      'import.trello',
      'import.wekan',
    ] as const;
    const allowed: string[] = [];
    for (const key of keys) {
      if (await hasPermission(authReq.user.id, workspaceId, key, 'workspace')) {
        allowed.push(key);
      }
    }
    if (authReq.user.isAppAdmin === true) {
      for (const imp of ['import.trello', 'import.wekan'] as const) {
        if (!allowed.includes(imp)) {
          allowed.push(imp);
        }
      }
    }
    const ownerId =
      typeof (workspace as { ownerId?: unknown }).ownerId === 'string'
        ? (workspace as { ownerId: string }).ownerId
        : '';
    if (ownerId !== '' && ownerId === authReq.user.id) {
      allowed.push('workspaces.delete');
    }
    res.json({ workspaceId, permissions: allowed, serverTs: Date.now() });
  } catch (error) {
    next(error);
  }
});

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

// Get workspace by ID
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = workspaceViewQuerySchema.parse(req.query);
    const options = query.view !== undefined ? { view: query.view } : undefined;
    const workspace = await getWorkspaceById(req.params.id, authReq.user.id, options);
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
    const responseWorkspace =
      query.view === 'summary' ? selectFields([workspace], query.fields)[0] : workspace;
    res.json({ workspace: responseWorkspace });
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

// Update workspace
router.put('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateWorkspaceSchema.parse(req.body);
    const workspace = await updateWorkspace(req.params.id, validated, authReq.user.id);
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
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
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

// Delete workspace
router.delete('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const deleted = await deleteWorkspace(req.params.id, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('owner')) {
      res.status(403).json({
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

export { router as workspaceRoutes };

