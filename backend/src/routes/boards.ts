import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { boardService } from '../services/board.service.js';
import { memberService } from '../services/member.service.js';
import { ForbiddenError, ValidationError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const generateInviteSchema = z.object({
  linkType: z.enum(['one_time', 'recurring']).default('one_time'),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  customRoleId: z.string().uuid().optional(),
}).refine((data) => {
  // For one_time links, either role or customRoleId can be set (not both)
  if (data.linkType === 'one_time') {
    return !(data.role && data.customRoleId);
  }
  // For recurring links, role/customRoleId should not be set
  return !data.role && !data.customRoleId;
}, {
  message: "For one-time links, set either 'role' or 'customRoleId', not both. For recurring links, do not set these fields.",
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
    const { linkType, role, customRoleId } = validated;

    // Check if user can create invites using permission service
    const context = permissionService.buildContext(
      authReq.userId!,
      authReq.user?.isAdmin ?? false,
      boardId
    );
    await permissionService.requirePermission('board.invite.create', context);

    // Validate role assignment permissions (for one-time links with role specified)
    if (linkType === 'one_time' && (role || customRoleId)) {
      // Check if user can change roles
      await permissionService.requirePermission('board.members.role.change', context);

      // Get current user's board membership to check their role
      const currentUserMember = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId: authReq.userId!,
          },
        },
      });

      // Role hierarchy enforcement
      if (!authReq.user?.isAdmin && currentUserMember) {
        if (role === 'admin') {
          // Only admins or app admins can assign admin role
          if (currentUserMember.role !== 'admin') {
            throw new ForbiddenError('Only admins can assign admin role via invite links');
          }
        } else if (role === 'manager') {
          // Managers cannot assign manager or admin roles
          if (currentUserMember.role === 'manager' || currentUserMember.role === 'viewer') {
            throw new ForbiddenError('You do not have permission to assign manager role');
          }
        }
      }

      // Validate custom role if specified
      if (customRoleId) {
        const customRole = await prisma.customRole.findUnique({
          where: { id: customRoleId },
          include: {
            permissions: true,
          },
        });

        if (!customRole) {
          throw new ValidationError('Custom role not found');
        }

        if (customRole.isSystem) {
          throw new ValidationError('Cannot use system roles in invite links');
        }
      }
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
        role: linkType === 'one_time' ? role : undefined,
        customRoleId: linkType === 'one_time' ? customRoleId : undefined,
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        linkType: true,
        role: true,
        customRoleId: true,
        createdAt: true,
      },
    });

    // Emit realtime event for invite link creation
    await emitDatabaseChange('boardInviteToken', 'INSERT', insertedToken as any, undefined, boardId);

    res.json({
      success: true,
      token: insertedToken.token,
      expiresAt: insertedToken.expiresAt,
      linkType: insertedToken.linkType,
      role: insertedToken.role,
      customRoleId: insertedToken.customRoleId,
    });
  } catch (error) {
    console.error('[POST /boards/:boardId/invites/generate] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as AuthRequest).userId,
      boardId: req.params.boardId,
      linkType: req.body?.linkType,
      role: req.body?.role,
      customRoleId: req.body?.customRoleId,
    });
    next(error);
  }
});

// GET /api/boards/:boardId/custom-roles - Get available custom roles for invite links
router.get('/:boardId/custom-roles', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId } = req.params;

    // Check if user can create invites using permission service
    const context = permissionService.buildContext(
      authReq.userId!,
      authReq.user?.isAdmin ?? false,
      boardId
    );
    await permissionService.requirePermission('board.invite.create', context);

    // Fetch all non-system custom roles
    const customRoles = await prisma.customRole.findMany({
      where: {
        isSystem: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(customRoles);
  } catch (error) {
    next(error);
  }
});

// GET /api/boards/:boardId/invites - Get all recurring invite tokens for a board
router.get('/:boardId/invites', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId } = req.params;

    // Check if user can view invites using permission service
    const context = permissionService.buildContext(
      authReq.userId!,
      authReq.user?.isAdmin ?? false,
      boardId
    );
    await permissionService.requirePermission('board.invite.create', context);

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
    console.error('[GET /boards/:boardId/invites] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as AuthRequest).userId,
      boardId: req.params.boardId,
    });
    next(error);
  }
});

// DELETE /api/boards/:boardId/invites/:tokenId - Delete an invite token
router.delete('/:boardId/invites/:tokenId', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const { boardId, tokenId } = req.params;

    // Check if user can delete invites using permission service
    const context = permissionService.buildContext(
      authReq.userId!,
      authReq.user?.isAdmin ?? false,
      boardId
    );
    await permissionService.requirePermission('board.invite.delete', context);

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

    // Emit realtime event for invite link deletion
    await emitDatabaseChange('boardInviteToken', 'DELETE', undefined, token as any, boardId);

    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /boards/:boardId/invites/:tokenId] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as AuthRequest).userId,
      boardId: req.params.boardId,
      tokenId: req.params.tokenId,
    });
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
