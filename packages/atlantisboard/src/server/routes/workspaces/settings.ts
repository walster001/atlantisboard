import { Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { getWorkspaceById } from '../../services/workspaceService.js';
import { hasPermission } from '../../utils/permissions.js';

const router = Router();

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

export { router as workspaceSettingsRoutes };
