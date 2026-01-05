import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { subtaskService } from '../services/subtask.service.js';

const router = Router();

router.use(authMiddleware);

// POST /api/subtasks - Create subtask
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const subtask = await subtaskService.create(authReq.userId!, req.body, authReq.user?.isAdmin ?? false);
    res.status(201).json(subtask);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/subtasks/:id - Update subtask
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const subtask = await subtaskService.update(authReq.userId!, req.params.id, req.body, authReq.user?.isAdmin ?? false);
    res.json(subtask);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/subtasks/:id - Delete subtask
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await subtaskService.delete(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;

