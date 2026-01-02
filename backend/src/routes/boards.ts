import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { boardService } from '../services/board.service.js';
import { memberService } from '../services/member.service.js';

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

// Member routes must come before /:id route to avoid route conflicts
// GET /api/boards/:boardId/members - Get board members
router.get('/:boardId/members', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const members = await memberService.getBoardMembers(authReq.userId!, req.params.boardId, authReq.user?.isAdmin ?? false);
    res.json(members);
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:boardId/members/find - Find user by email
router.get('/:boardId/members/find', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const email = req.query.email as string;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    const users = await memberService.findUserByEmail(authReq.userId!, email, req.params.boardId, authReq.user?.isAdmin ?? false);
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

// POST /api/boards/:boardId/members - Add board member
router.post('/:boardId/members', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const member = await memberService.addBoardMember(authReq.userId!, {
      boardId: req.params.boardId,
      ...req.body,
    }, authReq.user?.isAdmin ?? false);
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boards/:boardId/members/:userId - Remove board member
router.delete('/:boardId/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const result = await memberService.removeBoardMember(authReq.userId!, req.params.boardId, req.params.userId, authReq.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/boards/:boardId/members/:userId/role - Update member role
router.patch('/:boardId/members/:userId/role', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { role } = req.body;
    if (!role || !['admin', 'manager', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required' });
    }
    const member = await memberService.updateBoardMemberRole(
      authReq.userId!,
      req.params.boardId,
      req.params.userId,
      role,
      authReq.user?.isAdmin ?? false
    );
    return res.json(member);
  } catch (error) {
    return next(error);
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
