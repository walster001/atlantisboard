import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { cardService } from '../services/card.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/cards/:id - Get card by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const card = await cardService.findById(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(card);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/cards - Create card
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const card = await cardService.create(authReq.userId!, req.body, authReq.user?.isAdmin ?? false);
    res.status(201).json(card);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/cards/:id - Update card
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const card = await cardService.update(authReq.userId!, req.params.id, req.body, authReq.user?.isAdmin ?? false);
    res.json(card);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/cards/:id - Delete card
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await cardService.delete(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/cards/reorder - Batch reorder cards
router.post('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array is required' });
    }
    const result = await cardService.reorder(authReq.userId!, updates, authReq.user?.isAdmin ?? false);
    return res.json(result);
  } catch (error: unknown) {
    return next(error);
  }
});

// POST /api/cards/:id/assignees - Add assignee
router.post('/:id/assignees', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { userId: assigneeUserId } = req.body;
    if (!assigneeUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const assignee = await cardService.addAssignee(authReq.userId!, req.params.id, assigneeUserId, authReq.user?.isAdmin ?? false);
    return res.status(201).json(assignee);
  } catch (error: unknown) {
    return next(error);
  }
});

// DELETE /api/cards/:id/assignees/:userId - Remove assignee
router.delete('/:id/assignees/:userId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await cardService.removeAssignee(authReq.userId!, req.params.id, req.params.userId, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;

