import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { boardService } from '../services/board.service.js';
import { memberService } from '../services/member.service.js';
import { ForbiddenError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const generateInviteSchema = z.object({
  linkType: z.enum(['one_time', 'recurring']).default('one_time'),
});

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

// GET /api/boards/:boardId/audit-logs - Get board member audit logs
router.get('/:boardId/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId } = req.params;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

    const auditLogs = await memberService.getBoardMemberAuditLogs(
      authReq.userId!,
      boardId,
      authReq.user?.isAdmin ?? false,
      { page, limit, offset }
    );
    res.json(auditLogs);
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

// Invite routes must come before /:id route to avoid route conflicts
// POST /api/boards/:boardId/invites/generate - Generate an invite token for a board
router.post('/:boardId/invites/generate', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId } = req.params;
    const validated = generateInviteSchema.parse(req.body);
    const { linkType } = validated;

    // Check if user can create invites (board admin)
    const canCreate = await prisma.$queryRaw<Array<{ can_create_board_invite: boolean }>>`
      SELECT can_create_board_invite(${authReq.userId!}::uuid, ${boardId}::uuid) as can_create_board_invite
    `;

    if (!canCreate[0]?.can_create_board_invite) {
      throw new ForbiddenError('You must be a board admin to generate invite links');
    }

    // Generate cryptographically secure token
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const token = `inv_${crypto.randomUUID().replace(/-/g, '')}_${randomHex}`;

    // One-time links expire in 24 hours, recurring links never expire (null expires_at)
    const expiresAt = linkType === 'one_time' 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null;

    // Insert token into database
    const insertedToken = await prisma.boardInviteToken.create({
      data: {
        token,
        boardId,
        createdBy: authReq.userId!,
        expiresAt,
        linkType,
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        linkType: true,
      },
    });

    res.json({
      success: true,
      token: insertedToken.token,
      expiresAt: insertedToken.expiresAt,
      linkType: insertedToken.linkType,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:boardId/invites - Get all recurring invite tokens for a board
router.get('/:boardId/invites', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId } = req.params;

    // Check if user can view invites (board admin)
    const canCreate = await prisma.$queryRaw<Array<{ can_create_board_invite: boolean }>>`
      SELECT can_create_board_invite(${authReq.userId!}::uuid, ${boardId}::uuid) as can_create_board_invite
    `;

    if (!canCreate[0]?.can_create_board_invite) {
      throw new ForbiddenError('You must be a board admin to view invite links');
    }

    // Fetch recurring links (link_type = 'recurring', expires_at is NULL)
    const tokens = await prisma.boardInviteToken.findMany({
      where: {
        boardId,
        linkType: 'recurring',
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boards/:boardId/invites/:tokenId - Delete an invite token
router.delete('/:boardId/invites/:tokenId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId, tokenId } = req.params;

    // Check if user can delete invites (board admin)
    const canCreate = await prisma.$queryRaw<Array<{ can_create_board_invite: boolean }>>`
      SELECT can_create_board_invite(${authReq.userId!}::uuid, ${boardId}::uuid) as can_create_board_invite
    `;

    if (!canCreate[0]?.can_create_board_invite) {
      throw new ForbiddenError('You must be a board admin to delete invite links');
    }

    // Verify the token belongs to this board before deleting
    const token = await prisma.boardInviteToken.findFirst({
      where: {
        id: tokenId,
        boardId,
      },
    });

    if (!token) {
      return res.status(404).json({ error: 'Invite token not found' });
    }

    await prisma.boardInviteToken.delete({
      where: {
        id: tokenId,
      },
    });

    res.json({ success: true });
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
