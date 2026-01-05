import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { memberService } from '../services/member.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/boards/:boardId/members - Get board members
router.get('/boards/:boardId/members', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const members = await memberService.getBoardMembers(authReq.userId, req.params.boardId, authReq.user.isAdmin);
    res.json(members);
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/boards/:boardId/members - Add board member
router.post('/boards/:boardId/members', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const member = await memberService.addBoardMember(authReq.userId, {
      boardId: req.params.boardId,
      ...req.body,
    }, authReq.user.isAdmin);
    res.status(201).json(member);
  } catch (error: unknown) {
    next(error);
  }
});

// DELETE /api/boards/:boardId/members/:userId - Remove board member
router.delete('/boards/:boardId/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await memberService.removeBoardMember(authReq.userId, req.params.boardId, req.params.userId, authReq.user.isAdmin);
    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

// PATCH /api/boards/:boardId/members/:userId/role - Update member role
router.patch('/boards/:boardId/members/:userId/role', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { role } = req.body;
    if (!role || !['admin', 'manager', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required' });
    }
    const member = await memberService.updateBoardMemberRole(
      authReq.userId,
      req.params.boardId,
      req.params.userId,
      role,
      authReq.user.isAdmin
    );
    return res.json(member);
  } catch (error: unknown) {
    return next(error);
  }
});

// GET /api/boards/:boardId/members/find - Find user by email
router.get('/boards/:boardId/members/find', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const email = req.query.email as string;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    const users = await memberService.findUserByEmail(authReq.userId, email, req.params.boardId, authReq.user.isAdmin);
    return res.json(users);
  } catch (error: unknown) {
    return next(error);
  }
});

export default router;

