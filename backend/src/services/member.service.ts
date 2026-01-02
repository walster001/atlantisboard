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

    // Create membership
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

    // Emit add event
    await emitDatabaseChange('board_members', 'INSERT', member as any, undefined, validated.boardId);

    return member;
  }

  // Remove board member
  async removeBoardMember(userId: string, boardId: string, targetUserId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.members.remove', context);

    // Get board to check creator
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { createdBy: true },
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

    // Delete membership
    await prisma.boardMember.delete({
      where: {
        boardId_userId: {
          boardId,
          userId: targetUserId,
        },
      },
    });

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

    // Emit removal event
    await emitDatabaseChange('board_members', 'DELETE', undefined, member as any, boardId);

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
    await emitDatabaseChange('board_members', 'UPDATE', updated as any, member as any, boardId);

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
}

export const memberService = new MemberService();

