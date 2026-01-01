import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { columnService } from '../services/column.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/columns?boardId=:boardId - List columns for a board
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const boardId = req.query.boardId as string;
    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }
    const columns = await columnService.findAll(req.userId!, boardId, req.user?.isAdmin ?? false);
    res.json(columns);
  } catch (error) {
    next(error);
  }
});

// GET /api/columns/:id - Get column by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const column = await columnService.findById(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(column);
  } catch (error) {
    next(error);
  }
});

// POST /api/columns - Create column
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const column = await columnService.create(req.userId!, req.body, req.user?.isAdmin ?? false);
    res.status(201).json(column);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/columns/:id - Update column
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const column = await columnService.update(req.userId!, req.params.id, req.body, req.user?.isAdmin ?? false);
    res.json(column);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/columns/:id - Delete column
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await columnService.delete(req.userId!, req.params.id, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/columns/reorder - Batch reorder columns
router.post('/reorder', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { boardId, updates } = req.body;
    if (!boardId || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'boardId and updates array are required' });
    }
    const result = await columnService.reorder(req.userId!, boardId, updates, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

