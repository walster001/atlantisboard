import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { boardService } from '../services/board.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/boards - List user's boards
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const boards = await boardService.findAll(authReq.userId!, authReq.user?.isAdmin ?? false);
    res.json(boards);
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:id - Get board by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const board = await boardService.findById(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(board);
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:id/data - Get complete board data (replaces get_board_data function)
router.get('/:id/data', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const data = await boardService.getBoardData(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// POST /api/boards - Create board
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const board = await boardService.create(authReq.userId!, req.body, authReq.user?.isAdmin ?? false);
    res.status(201).json(board);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/boards/:id - Update board
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const board = await boardService.update(authReq.userId!, req.params.id, req.body, authReq.user?.isAdmin ?? false);
    res.json(board);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boards/:id - Delete board
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await boardService.delete(authReq.userId!, req.params.id, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/boards/:id/position - Update board position
router.patch('/:id/position', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { position, workspaceId } = req.body;
    const board = await boardService.updatePosition(
      authReq.userId!,
      req.params.id,
      position,
      workspaceId,
      authReq.user?.isAdmin ?? false
    );
    res.json(board);
  } catch (error) {
    next(error);
  }
});

export default router;

