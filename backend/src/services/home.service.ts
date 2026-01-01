import { prisma } from '../db/client.js';
import { boardService } from './board.service.js';

class HomeService {
  // Get home page data (replaces get_home_data function)
  async getHomeData(userId: string, isAppAdmin: boolean) {
    // Get workspaces user has access to
    const workspaces = await prisma.workspace.findMany({
      where: isAppAdmin
        ? {}
        : {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
      include: {
        owner: {
          include: {
            profile: true,
          },
        },
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
      orderBy: { createdAt: 'desc' },
    });

    // Get boards user has access to
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

    // Get board roles for user
    const boardMemberships = await prisma.boardMember.findMany({
      where: { userId },
      select: {
        boardId: true,
        role: true,
      },
    });

    const boardRoles = boardMemberships.reduce((acc, membership) => {
      acc[membership.boardId] = membership.role;
      return acc;
    }, {} as Record<string, 'admin' | 'manager' | 'viewer'>);

    return {
      workspaces,
      boards,
      board_roles: boardRoles,
    };
  }
}

export const homeService = new HomeService();

