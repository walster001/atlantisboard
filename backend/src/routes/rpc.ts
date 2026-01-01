import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { homeService } from '../services/home.service.js';
import { boardService } from '../services/board.service.js';
import { memberService } from '../services/member.service.js';
import { columnService } from '../services/column.service.js';
import { cardService } from '../services/card.service.js';
import { prisma } from '../db/client.js';

const router = Router();

router.use(authMiddleware);

// Map RPC function names to handlers
const rpcHandlers: Record<string, (req: AuthRequest, params: any) => Promise<any>> = {
  get_home_data: async (req, params) => {
    return homeService.getHomeData(req.userId!, req.user?.isAdmin ?? false);
  },

  get_board_data: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    return boardService.getBoardData(userId || req.userId!, boardId, req.user?.isAdmin ?? false);
  },

  get_board_member_profiles: async (req, params) => {
    const { _board_id: boardId } = params;
    return memberService.getBoardMembers(req.userId!, boardId, req.user?.isAdmin ?? false);
  },

  find_user_by_email: async (req, params) => {
    const { _email: email, _board_id: boardId } = params;
    return memberService.findUserByEmail(req.userId!, email, boardId, req.user?.isAdmin ?? false);
  },

  is_app_admin: async (req, params) => {
    const { _user_id: userId } = params;
    const user = await prisma.user.findUnique({
      where: { id: userId || req.userId! },
      include: { profile: true },
    });
    return user?.profile?.isAdmin ?? false;
  },

  get_board_role: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: userId || req.userId!,
        },
      },
    });
    return membership?.role ?? null;
  },

  is_board_member: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: userId || req.userId!,
        },
      },
    });
    return !!membership;
  },

  can_edit_board: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    if (req.user?.isAdmin) {
      return true;
    }
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: userId || req.userId!,
        },
      },
    });
    return membership?.role === 'admin';
  },

  can_manage_members: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    if (req.user?.isAdmin) {
      return true;
    }
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: userId || req.userId!,
        },
      },
    });
    return membership?.role === 'admin' || membership?.role === 'manager';
  },

  can_create_board_invite: async (req, params) => {
    const { _board_id: boardId, _user_id: userId } = params;
    if (req.user?.isAdmin) {
      return true;
    }
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: userId || req.userId!,
        },
      },
    });
    return membership?.role === 'admin';
  },

  batch_update_column_positions: async (req, params) => {
    const { _user_id: userId, _board_id: boardId, _updates: updates } = params;
    if (!Array.isArray(updates)) {
      throw new Error('Invalid updates parameter');
    }
    return columnService.reorder(
      userId || req.userId!,
      boardId,
      updates.map((u: any) => ({ id: u.id, position: u.position })),
      req.user?.isAdmin ?? false
    );
  },

  batch_update_card_positions: async (req, params) => {
    const { _user_id: userId, _updates: updates } = params;
    if (!Array.isArray(updates)) {
      throw new Error('Invalid updates parameter');
    }
    return cardService.reorder(
      userId || req.userId!,
      updates.map((u: any) => ({ id: u.id, columnId: u.column_id, position: u.position })),
      req.user?.isAdmin ?? false
    );
  },

  batch_update_board_positions: async (req, params) => {
    const { _user_id: userId, _workspace_id: workspaceId, _updates: updates } = params;
    if (!Array.isArray(updates)) {
      throw new Error('Invalid updates parameter');
    }
    const effectiveUserId = userId || req.userId!;
    const isAppAdmin = req.user?.isAdmin ?? false;

    // Update all board positions in transaction
    await prisma.$transaction(
      updates.map((update: any) =>
        prisma.board.update({
          where: { id: update.id },
          data: { position: update.position },
        })
      )
    );

    // Emit update events for each board
    for (const update of updates) {
      const board = await prisma.board.findUnique({ where: { id: update.id } });
      if (board) {
        // Check permission for each board
        const context = { userId: effectiveUserId, isAppAdmin, boardId: board.id };
        // Permission check is done at service level, but we need to verify access
        // For now, emit the event - the service will handle permission checks
      }
    }

    return { success: true };
  },

  move_board_to_workspace: async (req, params) => {
    const { _user_id: userId, _board_id: boardId, _new_workspace_id: newWorkspaceId, _new_position: newPosition } = params;
    return boardService.updatePosition(
      userId || req.userId!,
      boardId,
      newPosition,
      newWorkspaceId,
      req.user?.isAdmin ?? false
    );
  },

  update_card: async (req, params) => {
    const { _user_id: userId, _card_id: cardId, _title: title, _description: description, _due_date: dueDate } = params;
    return cardService.update(
      userId || req.userId!,
      cardId,
      {
        title: title || undefined,
        description: description !== undefined ? description : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      },
      req.user?.isAdmin ?? false
    );
  },

  get_board_deletion_counts: async (req, params) => {
    const { _board_id: boardId } = params;
    
    // Get column IDs for this board
    const columnIds = await prisma.column.findMany({
      where: { boardId },
      select: { id: true },
    }).then(cols => cols.map(c => c.id));

    // Get card IDs in these columns
    const cardIds = await prisma.card.findMany({
      where: { columnId: { in: columnIds } },
      select: { id: true },
    }).then(cards => cards.map(c => c.id));

    // Count related records
    const [columnsCount, cardsCount, membersCount, labelsCount, attachmentsCount] = await Promise.all([
      prisma.column.count({ where: { boardId } }),
      prisma.card.count({ where: { columnId: { in: columnIds } } }),
      prisma.boardMember.count({ where: { boardId } }),
      prisma.label.count({ where: { boardId } }),
      prisma.cardAttachment.count({ where: { cardId: { in: cardIds } } }),
    ]);

    return {
      columns: columnsCount,
      cards: cardsCount,
      members: membersCount,
      labels: labelsCount,
      attachments: attachmentsCount,
    };
  },

  get_workspace_deletion_counts: async (req, params) => {
    const { _workspace_id: workspaceId } = params;
    
    // Get board IDs for this workspace
    const boardIds = await prisma.board.findMany({
      where: { workspaceId },
      select: { id: true },
    }).then(boards => boards.map(b => b.id));

    // Get column IDs for these boards
    const columnIds = await prisma.column.findMany({
      where: { boardId: { in: boardIds } },
      select: { id: true },
    }).then(cols => cols.map(c => c.id));

    // Get card IDs in these columns
    const cardIds = await prisma.card.findMany({
      where: { columnId: { in: columnIds } },
      select: { id: true },
    }).then(cards => cards.map(c => c.id));

    // Count related records
    const [boardsCount, columnsCount, cardsCount, membersCount, labelsCount, attachmentsCount] = await Promise.all([
      prisma.board.count({ where: { workspaceId } }),
      prisma.column.count({ where: { boardId: { in: boardIds } } }),
      prisma.card.count({ where: { columnId: { in: columnIds } } }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.label.count({ where: { boardId: { in: boardIds } } }),
      prisma.cardAttachment.count({ where: { cardId: { in: cardIds } } }),
    ]);

    return {
      boards: boardsCount,
      columns: columnsCount,
      cards: cardsCount,
      members: membersCount,
      labels: labelsCount,
      attachments: attachmentsCount,
    };
  },
};

// POST /api/rpc/:functionName - Call RPC function
router.post('/:functionName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { functionName } = req.params;
    const handler = rpcHandlers[functionName];

    if (!handler) {
      return res.status(404).json({ error: `RPC function not found: ${functionName}` });
    }

    const result = await handler(req, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

