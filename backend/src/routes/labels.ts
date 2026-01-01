import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { labelService } from '../services/label.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/labels?boardId=:boardId - List labels for a board
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const boardId = req.query.boardId as string;
    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }
    const labels = await labelService.findAll(req.userId!, boardId, req.user?.isAdmin ?? false);
    res.json(labels);
  } catch (error) {
    next(error);
  }
});

// POST /api/labels - Create label
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const label = await labelService.create(req.userId!, req.body, req.user?.isAdmin ?? false);
    res.status(201).json(label);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/labels/:id - Update label
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const label = await labelService.update(req.userId!, req.params.id, req.body, req.user?.isAdmin ?? false);
    res.json(label);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/labels/:id - Delete label
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await labelService.delete(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/labels/:id/assign - Assign label to card
router.post('/:id/assign', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body;
    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' });
    }
    const cardLabel = await labelService.assignToCard(req.userId!, cardId, req.params.id, req.user?.isAdmin ?? false);
    res.status(201).json(cardLabel);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/labels/:id/assign/:cardId - Remove label from card
router.delete('/:id/assign/:cardId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await labelService.removeFromCard(req.userId!, req.params.cardId, req.params.id, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

