import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { cardService } from '../services/card.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/cards/:id - Get card by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const card = await cardService.findById(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(card);
  } catch (error) {
    next(error);
  }
});

// POST /api/cards - Create card
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const card = await cardService.create(req.userId!, req.body, req.user?.isAdmin ?? false);
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/cards/:id - Update card
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const card = await cardService.update(req.userId!, req.params.id, req.body, req.user?.isAdmin ?? false);
    res.json(card);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/cards/:id - Delete card
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await cardService.delete(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/cards/reorder - Batch reorder cards
router.post('/reorder', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array is required' });
    }
    const result = await cardService.reorder(req.userId!, updates, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/cards/:id/assignees - Add assignee
router.post('/:id/assignees', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: assigneeUserId } = req.body;
    if (!assigneeUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const assignee = await cardService.addAssignee(req.userId!, req.params.id, assigneeUserId, req.user?.isAdmin ?? false);
    res.status(201).json(assignee);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/cards/:id/assignees/:userId - Remove assignee
router.delete('/:id/assignees/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await cardService.removeAssignee(req.userId!, req.params.id, req.params.userId, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

