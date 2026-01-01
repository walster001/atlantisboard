import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { subtaskService } from '../services/subtask.service.js';

const router = Router();

router.use(authMiddleware);

// POST /api/subtasks - Create subtask
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subtask = await subtaskService.create(req.userId!, req.body, req.user?.isAdmin ?? false);
    res.status(201).json(subtask);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/subtasks/:id - Update subtask
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subtask = await subtaskService.update(req.userId!, req.params.id, req.body, req.user?.isAdmin ?? false);
    res.json(subtask);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/subtasks/:id - Delete subtask
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await subtaskService.delete(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

