import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { memberService } from '../services/member.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/boards/:boardId/members - Get board members
router.get('/boards/:boardId/members', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const members = await memberService.getBoardMembers(req.userId!, req.params.boardId, req.user?.isAdmin ?? false);
    res.json(members);
  } catch (error) {
    next(error);
  }
});

// POST /api/boards/:boardId/members - Add board member
router.post('/boards/:boardId/members', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const member = await memberService.addBoardMember(req.userId!, {
      boardId: req.params.boardId,
      ...req.body,
    }, req.user?.isAdmin ?? false);
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boards/:boardId/members/:userId - Remove board member
router.delete('/boards/:boardId/members/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await memberService.removeBoardMember(req.userId!, req.params.boardId, req.params.userId, req.user?.isAdmin ?? false);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/boards/:boardId/members/:userId/role - Update member role
router.patch('/boards/:boardId/members/:userId/role', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'manager', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required' });
    }
    const member = await memberService.updateBoardMemberRole(
      req.userId!,
      req.params.boardId,
      req.params.userId,
      role,
      req.user?.isAdmin ?? false
    );
    res.json(member);
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:boardId/members/find - Find user by email
router.get('/boards/:boardId/members/find', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const email = req.query.email as string;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    const users = await memberService.findUserByEmail(req.userId!, email, req.params.boardId, req.user?.isAdmin ?? false);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

export default router;

