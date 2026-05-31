import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  createWorkspace,
  getWorkspaceById,
  getUserWorkspaces,
  updateWorkspace,
  deleteWorkspace,
} from '../../services/workspaceService.js';
import { userCanCreateWorkspace } from '../../utils/permissions.js';
import {
  createWorkspaceSchema,
  selectFields,
  updateWorkspaceSchema,
  workspaceViewQuerySchema,
} from './_helpers.js';

const router = Router();

// Create workspace
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const canCreate = await userCanCreateWorkspace(authReq.user.id, authReq.user.isAppAdmin);
    if (!canCreate) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to create a workspace',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
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

export { router as workspaceCrudRoutes };
