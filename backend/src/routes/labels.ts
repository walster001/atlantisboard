import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { labelService } from '../services/label.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/labels?boardId=:boardId - List labels for a board
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const boardId = req.query.boardId as string;
    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }
    const labels = await labelService.findAll(authReq.userId!, boardId, authReq.user?.isAdmin ?? false);
    return res.json(labels);
  } catch (error: unknown) {
    return next(error);
  }
});

// POST /api/labels - Create label
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const label = await labelService.create(authReq.userId!, req.body, authReq.user?.isAdmin ?? false);
    res.status(201).json(label);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/labels/:id - Update label
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const label = await labelService.update(authReq.userId!, req.params.id, req.body, authReq.user?.isAdmin ?? false);
    res.json(label);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/labels/:id - Delete label
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await labelService.delete(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/labels/:id/assign - Assign label to card
router.post('/:id/assign', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { cardId } = req.body;
    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' });
    }
    const cardLabel = await labelService.assignToCard(authReq.userId!, cardId, req.params.id, authReq.user?.isAdmin ?? false);
    return res.status(201).json(cardLabel);
  } catch (error: unknown) {
    return next(error);
  }
});

// DELETE /api/labels/:id/assign/:cardId - Remove label from card
router.delete('/:id/assign/:cardId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await labelService.removeFromCard(authReq.userId!, req.params.cardId, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;

