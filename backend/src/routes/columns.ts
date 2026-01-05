import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { columnService } from '../services/column.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/columns?boardId=:boardId - List columns for a board
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const boardId = req.query.boardId as string;
    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }
    const columns = await columnService.findAll(authReq.userId, boardId, authReq.user.isAdmin);
    return res.json(columns);
  } catch (error: unknown) {
    return next(error);
  }
});

// GET /api/columns/:id - Get column by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const column = await columnService.findById(authReq.userId, req.params.id, authReq.user.isAdmin);
    res.json(column);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/columns - Create column
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const column = await columnService.create(authReq.userId, req.body, authReq.user.isAdmin);
    res.status(201).json(column);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/columns/:id - Update column
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const column = await columnService.update(authReq.userId, req.params.id, req.body, authReq.user.isAdmin);
    res.json(column);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/columns/:id - Delete column
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await columnService.delete(authReq.userId, req.params.id, authReq.user.isAdmin);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/columns/reorder - Batch reorder columns
router.post('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { boardId, updates } = req.body;
    if (!boardId || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'boardId and updates array are required' });
    }
    const result = await columnService.reorder(authReq.userId, boardId, updates, authReq.user.isAdmin);
    return res.json(result);
  } catch (error: unknown) {
    return next(error);
  }
});

export default router;

