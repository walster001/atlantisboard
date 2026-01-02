import { prisma } from '../db/client.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange, emitCustomEvent } from '../realtime/emitter.js';

const createBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  backgroundColor: z.string().optional().nullable(),
  themeId: z.string().uuid().optional().nullable(),
});

const updateBoardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  backgroundColor: z.string().optional().nullable(),
  themeId: z.string().uuid().optional().nullable(),
});

class BoardService {
  // Check if user is board member or app admin
  async checkBoardAccess(userId: string, boardId: string, isAppAdmin: boolean): Promise<boolean> {
    if (isAppAdmin) {
      return true;
    }

    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    return !!membership;
  }

  // Get user's role on board
  private async getUserRole(userId: string, boardId: string, isAppAdmin: boolean): Promise<'admin' | 'manager' | 'viewer' | null> {
    if (isAppAdmin) {
      return 'admin';
    }

    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    return membership?.role ?? null;
  }

  // Get complete board data (replaces get_board_data function)
  async getBoardData(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    // Get board
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Get user role
    const userRole = await this.getUserRole(userId, boardId, isAppAdmin);

    // Get columns (ordered by position)
    const columns = await prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });

    // Get all cards in these columns
    const columnIds = columns.map((c: { id: string }) => c.id);
    const cards = await prisma.card.findMany({
      where: {
        columnId: { in: columnIds },
      },
      orderBy: [
        { columnId: 'asc' },
        { position: 'asc' },
      ],
      include: {
        assignees: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        subtasks: {
          orderBy: { position: 'asc' },
        },
        attachments: true,
        labels: {
          include: {
            label: true,
          },
        },
      },
    });

    // Get labels
    const labels = await prisma.label.findMany({
      where: { boardId },
    });

    // Get card labels (many-to-many)
    const cardLabels = await prisma.cardLabel.findMany({
      where: {
        cardId: { in: cards.map((c: { id: string }) => c.id) },
      },
    });

    // Get board members with profiles
    const members = await prisma.boardMember.findMany({
      where: { boardId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Format members (hide email unless self or app admin)
    const formattedMembers = members.map((member: { userId: string; role: string; user: { email: string; profile?: { id: string; fullName: string | null; avatarUrl: string | null } | null } }) => ({
      userId: member.userId,
      role: member.role,
      profiles: {
        id: member.user.profile?.id ?? member.userId,
        email: userId === member.userId || isAppAdmin ? member.user.email : null,
        fullName: member.user.profile?.fullName ?? null,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      },
    }));

    return {
      board: {
        id: board.id,
        name: board.name,
        description: board.description,
        backgroundColor: board.backgroundColor,
        workspaceId: board.workspaceId,
      },
      userRole: userRole,
      columns,
      cards,
      labels,
      cardLabels: cardLabels,
      members: formattedMembers,
    };
  }

  async create(userId: string, data: z.infer<typeof createBoardSchema>, isAppAdmin: boolean) {
    const validated = createBoardSchema.parse(data);

    // Check app-level permission to create boards
    const appContext = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.board.create', appContext);

    // Check if user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: validated.workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!workspace) {
      throw new ForbiddenError('Access denied to workspace');
    }

    // Get max position for new board
    const maxPosition = await prisma.board.aggregate({
      where: { workspaceId: validated.workspaceId },
      _max: { position: true },
    });

    const board = await prisma.board.create({
      data: {
        workspaceId: validated.workspaceId,
        name: validated.name,
        description: validated.description ?? null,
        backgroundColor: validated.backgroundColor ?? null,
        themeId: validated.themeId ?? null,
        position: (maxPosition._max.position ?? -1) + 1,
      },
    });

    // Add creator as admin member
    await prisma.boardMember.create({
      data: {
        boardId: board.id,
        userId,
        role: 'admin',
      },
    });

    // Emit create event
    await emitDatabaseChange('boards', 'INSERT', board as any, undefined, board.id);

    return board;
  }

  async findById(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        workspace: true,
        theme: true,
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    return board;
  }

  async findAll(userId: string, isAppAdmin: boolean) {
    const boards = await prisma.board.findMany({
      where: isAppAdmin
        ? {}
        : {
            members: {
              some: { userId },
            },
          },
      include: {
        workspace: true,
        theme: true,
      },
      orderBy: [
        { workspaceId: 'asc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return boards;
  }

  async update(userId: string, boardId: string, data: z.infer<typeof updateBoardSchema>, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.edit', context);

    const validated = updateBoardSchema.parse(data);

    const updated = await prisma.board.update({
      where: { id: boardId },
      data: {
        name: validated.name,
        description: validated.description,
        backgroundColor: validated.backgroundColor,
        themeId: validated.themeId,
      },
    });

    return updated;
  }

  async delete(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.delete', context);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true },
    });

    await prisma.board.delete({
      where: { id: boardId },
    });

    // Emit board removal event to all workspace members
    if (board?.workspaceId) {
      await emitCustomEvent(`workspace:${board.workspaceId}`, 'board.removed', {
        boardId,
        workspaceId: board.workspaceId,
      });
    }

    // Also emit to board channel (for clients currently viewing the board)
    await emitCustomEvent(`board:${boardId}`, 'board.removed', {
      boardId,
    });

    return { success: true };
  }

  async updatePosition(userId: string, boardId: string, newPosition: number, newWorkspaceId?: string, isAppAdmin?: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin ?? false, boardId);
    await permissionService.requirePermission('board.move', context);

    const updateData: any = {
      position: newPosition,
    };

    if (newWorkspaceId) {
      // Verify access to new workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: newWorkspaceId,
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      });

      if (!workspace) {
        throw new ForbiddenError('Access denied to target workspace');
      }

      updateData.workspaceId = newWorkspaceId;
    }

    // Get old board before update
    const oldBoard = await prisma.board.findUnique({ where: { id: boardId } });
    
    const updated = await prisma.board.update({
      where: { id: boardId },
      data: updateData,
    });

    // Emit update event
    await emitDatabaseChange('boards', 'UPDATE', updated as any, oldBoard as any, boardId);

    return updated;
  }
}

export const boardService = new BoardService();

