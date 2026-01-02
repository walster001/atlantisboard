import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { workspaceService } from '../services/workspace.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/workspaces - List user's workspaces
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const workspaces = await workspaceService.findAll(authReq.userId!);
    res.json(workspaces);
  } catch (error) {
    next(error);
  }
});

// GET /api/workspaces/:id - Get workspace by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const workspace = await workspaceService.findById(authReq.userId!, req.params.id);
    res.json(workspace);
  } catch (error) {
    next(error);
  }
});

// POST /api/workspaces - Create workspace
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const workspace = await workspaceService.create(authReq.userId!, req.body, authReq.user?.isAdmin ?? false);
    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/workspaces/:id - Update workspace
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const workspace = await workspaceService.update(authReq.userId!, req.params.id, req.body, authReq.user?.isAdmin ?? false);
    res.json(workspace);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/workspaces/:id - Delete workspace
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await workspaceService.delete(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/workspaces/:id/members - Add member
router.post('/:id/members', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { userId: memberUserId } = req.body;
    if (!memberUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const member = await workspaceService.addMember(authReq.userId!, req.params.id, memberUserId);
    return res.status(201).json(member);
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/workspaces/:id/members/:userId - Remove member
router.delete('/:id/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await workspaceService.removeMember(authReq.userId!, req.params.id, req.params.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

