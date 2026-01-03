import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange, emitCustomEvent } from '../realtime/emitter.js';

const addBoardMemberSchema = z.object({
  boardId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
});


class MemberService {

  // Get board members
  async getBoardMembers(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check board access
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Check membership exists (not used but kept for future permission checks)
    await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.members.view', context);

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

    // Format response (hide email unless self or app admin)
    return members.map((member: { userId: string; role: string; user: { email: string; profile?: { id: string; fullName: string | null; avatarUrl: string | null } | null } }) => ({
      userId: member.userId,
      role: member.role,
      profiles: {
        id: member.user.profile?.id ?? member.userId,
        email: userId === member.userId || isAppAdmin ? member.user.email : null,
        fullName: member.user.profile?.fullName ?? null,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      },
    }));
  }

  // Add board member
  async addBoardMember(userId: string, data: z.infer<typeof addBoardMemberSchema>, isAppAdmin: boolean) {
    const validated = addBoardMemberSchema.parse(data);

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, validated.boardId);
    await permissionService.requirePermission('board.members.add', context);

    // Check if member already exists
    const existing = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId: validated.boardId,
          userId: validated.userId,
        },
      },
    });

    if (existing) {
      throw new ValidationError('User is already a member of this board');
    }

    // Get board to find workspace
    const board = await prisma.board.findUnique({
      where: { id: validated.boardId },
      select: { workspaceId: true },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Create board membership
    const member = await prisma.boardMember.create({
      data: {
        boardId: validated.boardId,
        userId: validated.userId,
        role: validated.role,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Automatically add user to workspace if not already a member
    const workspaceMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: board.workspaceId,
          userId: validated.userId,
        },
      },
    });

    if (!workspaceMembership) {
      // User is not a workspace member, add them automatically
      const newWorkspaceMember = await prisma.workspaceMember.create({
        data: {
          workspaceId: board.workspaceId,
          userId: validated.userId,
        },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      // Emit workspace membership event
      await emitDatabaseChange('workspaceMembers', 'INSERT', newWorkspaceMember as any, undefined);
    }

    // Create audit log entry
    await prisma.boardMemberAuditLog.create({
      data: {
        boardId: validated.boardId,
        action: 'added',
        targetUserId: validated.userId,
        actorUserId: userId,
        newRole: validated.role,
      },
    });

    // Emit board membership add event
    console.log('[MemberService] Emitting boardMembers INSERT event:', {
      table: 'boardMembers',
      event: 'INSERT',
      boardId: validated.boardId,
      userId: validated.userId,
      role: validated.role,
      hasUserData: !!(member as any).user,
    });
    await emitDatabaseChange('boardMembers', 'INSERT', member as any, undefined, validated.boardId);

    return member;
  }

  // Remove board member
  async removeBoardMember(userId: string, boardId: string, targetUserId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.members.remove', context);

    // Get board to check creator and workspace
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { createdBy: true, workspaceId: true },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Get member to get old role and check current user's role
    const [member, currentUserMember] = await Promise.all([
      prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId: targetUserId,
          },
        },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      }),
      prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
      }),
    ]);

    if (!member) {
      // Log for debugging - member exists in UI but not in database
      // This can happen if the UI state is stale or there's a data inconsistency
      console.error(`[removeBoardMember] Member not found: boardId=${boardId}, targetUserId=${targetUserId}`);
      throw new NotFoundError('Member not found');
    }

    // Rule 1: Board creator cannot be removed by anyone (including self)
    if (board.createdBy === targetUserId) {
      throw new ValidationError('The board creator cannot be removed from the board. Delete the board to remove access.');
    }

    // Rule 2: Role hierarchy enforcement - Managers cannot remove admins
    // Only app admins can bypass this check
    if (!isAppAdmin && currentUserMember) {
      if (currentUserMember.role === 'manager' && member.role === 'admin') {
        throw new ValidationError('Managers cannot remove admins from the board');
      }
      // Managers also cannot remove other managers
      if (currentUserMember.role === 'manager' && member.role === 'manager') {
        throw new ValidationError('Managers cannot remove other managers from the board');
      }
    }

    // Cannot remove last admin
    const adminCount = await prisma.boardMember.count({
      where: {
        boardId,
        role: 'admin',
      },
    });

    if (member.role === 'admin' && adminCount === 1) {
      throw new ValidationError('Cannot remove the last admin from a board');
    }

    // Get member with user/profile data before deletion for event emission
    const memberToDelete = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: targetUserId,
        },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Delete membership
    await prisma.boardMember.delete({
      where: {
        boardId_userId: {
          boardId,
          userId: targetUserId,
        },
      },
    });

    // Check if user has any remaining boards in this workspace
    const remainingBoardsInWorkspace = await prisma.boardMember.count({
      where: {
        userId: targetUserId,
        board: {
          workspaceId: board.workspaceId,
        },
      },
    });

    // If this was the last board in the workspace, remove workspace membership
    // But skip if user is the workspace owner (owner should always have access)
    if (remainingBoardsInWorkspace === 0) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: board.workspaceId },
        select: { ownerId: true },
      });

      if (workspace && workspace.ownerId !== targetUserId) {
        // User is not the owner, remove workspace membership
        const workspaceMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: board.workspaceId,
              userId: targetUserId,
            },
          },
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        });

        if (workspaceMember) {
          await prisma.workspaceMember.delete({
            where: {
              workspaceId_userId: {
                workspaceId: board.workspaceId,
                userId: targetUserId,
              },
            },
          });

          // Emit workspace membership removal event
          await emitDatabaseChange('workspaceMembers', 'DELETE', undefined, workspaceMember as any);
        }
      }
    }

    // Create audit log entry
    await prisma.boardMemberAuditLog.create({
      data: {
        boardId,
        action: 'removed',
        targetUserId,
        actorUserId: userId,
        oldRole: member.role,
      },
    });

    // Emit removal event (use memberToDelete which has user/profile data)
    console.log('[MemberService] Emitting boardMembers DELETE event:', {
      table: 'boardMembers',
      event: 'DELETE',
      boardId: boardId,
      userId: targetUserId,
      hasUserData: !!(memberToDelete as any)?.user,
    });
    await emitDatabaseChange('boardMembers', 'DELETE', undefined, memberToDelete as any, boardId);

    // If user was removed, notify them via custom event
    await emitCustomEvent(`board:${boardId}`, 'board.member.removed', {
      userId: targetUserId,
      boardId,
    });

    return { success: true };
  }

  // Update board member role
  async updateBoardMemberRole(userId: string, boardId: string, targetUserId: string, role: 'admin' | 'manager' | 'viewer', isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.members.role.change', context);

    // Get current member and current user's member record
    const [member, currentUserMember] = await Promise.all([
      prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId: targetUserId,
          },
        },
      }),
      prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId,
          },
        },
      }),
    ]);

    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // Role hierarchy enforcement - Managers cannot change roles of admins
    // Only app admins can bypass this check
    if (!isAppAdmin && currentUserMember) {
      if (currentUserMember.role === 'manager' && member.role === 'admin') {
        throw new ValidationError('Managers cannot change the role of admins');
      }
      // Managers also cannot promote anyone to admin or manager
      if (currentUserMember.role === 'manager' && (role === 'admin' || role === 'manager')) {
        throw new ValidationError('Managers cannot assign admin or manager roles');
      }
    }

    // Cannot change role of last admin
    if (member.role === 'admin' && role !== 'admin') {
      const adminCount = await prisma.boardMember.count({
        where: {
          boardId,
          role: 'admin',
        },
      });

      if (adminCount === 1) {
        throw new ValidationError('Cannot change role of the last admin');
      }
    }

    // Update role
    const updated = await prisma.boardMember.update({
      where: {
        boardId_userId: {
          boardId,
          userId: targetUserId,
        },
      },
      data: { role },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Create audit log entry
    await prisma.boardMemberAuditLog.create({
      data: {
        boardId,
        action: 'role_changed',
        targetUserId,
        actorUserId: userId,
        oldRole: member.role,
        newRole: role,
      },
    });

    // Emit update event
    console.log('[MemberService] Emitting boardMembers UPDATE event:', {
      table: 'boardMembers',
      event: 'UPDATE',
      boardId: boardId,
      userId: targetUserId,
      oldRole: member.role,
      newRole: role,
      hasUserData: !!(updated as any).user,
    });
    await emitDatabaseChange('boardMembers', 'UPDATE', updated as any, member as any, boardId);

    return updated;
  }

  // Find user by email (for adding to boards)
  async findUserByEmail(userId: string, email: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.members.view', context);

    const users = await prisma.user.findMany({
      where: { email },
      include: {
        profile: true,
      },
    });

    return users.map((user: { id: string; email: string; profile?: { fullName: string | null; avatarUrl: string | null } | null }) => ({
      id: user.id,
      email: user.email,
      fullName: user.profile?.fullName ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    }));
  }

  // Get board member audit logs
  async getBoardMemberAuditLogs(
    userId: string,
    boardId: string,
    isAppAdmin: boolean,
    options: { page?: number; limit?: number; offset?: number } = {}
  ) {
    // Check board exists
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.settings.audit', context);

    // Parse pagination options
    const limit = options.limit ?? 20;
    const offset = options.offset ?? (options.page ?? 0) * limit;

    // Query audit logs with actor relation (includes User -> Profile)
    const auditLogs = await prisma.boardMemberAuditLog.findMany({
      where: { boardId },
      include: {
        actor: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get unique target user IDs
    const targetUserIds = [...new Set(auditLogs.map(log => log.targetUserId).filter(Boolean))];

    // Query profiles for target users
    const targetProfiles = await prisma.profile.findMany({
      where: {
        id: {
          in: targetUserIds,
        },
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    // Create profile lookup map for targets
    const targetProfileMap = new Map(
      targetProfiles.map(profile => [
        profile.id,
        {
          fullName: profile.fullName,
          email: profile.user.email,
          avatarUrl: profile.avatarUrl,
        },
      ])
    );

    // Format response with resolved profiles
    return auditLogs.map(log => ({
      id: log.id,
      boardId: log.boardId,
      action: log.action as 'added' | 'removed' | 'role_changed',
      targetUserId: log.targetUserId,
      actorUserId: log.actorUserId,
      oldRole: log.oldRole,
      newRole: log.newRole,
      createdAt: log.createdAt.toISOString(),
      targetProfile: log.targetUserId ? targetProfileMap.get(log.targetUserId) : undefined,
      actorProfile: log.actor
        ? {
            fullName: log.actor.profile?.fullName ?? null,
            email: log.actor.email,
            avatarUrl: log.actor.profile?.avatarUrl ?? null,
          }
        : undefined,
    }));
  }
}

export const memberService = new MemberService();

