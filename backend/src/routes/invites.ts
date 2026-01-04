/**
 * Invite Routes - Token Redemption
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { emitCustomEvent, emitDatabaseChange } from '../realtime/emitter.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const redeemInviteSchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/invites/redeem
 * Redeem an invite token
 */
router.post('/redeem', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const validated = redeemInviteSchema.parse(req.body);
    const { token } = validated;

    // Find the invite token
    const inviteToken = await prisma.boardInviteToken.findUnique({
      where: { token },
      include: {
        board: {
          select: {
            id: true,
            workspaceId: true,
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Validate token exists
    if (!inviteToken) {
      return res.status(404).json({
        error: 'invalid_token',
        message: 'Invite token not found',
        success: false,
      });
    }

    // Check if token is expired (for one-time links)
    if (inviteToken.expiresAt && new Date(inviteToken.expiresAt) < new Date()) {
      return res.status(410).json({
        error: 'expired',
        message: 'This invite link has expired',
        success: false,
      });
    }

    // Check if one-time token is already used
    if (inviteToken.linkType === 'one_time' && inviteToken.usedAt) {
      return res.status(410).json({
        error: 'already_used',
        message: 'This invite link has already been used',
        success: false,
      });
    }

    // Check if user is already a board member
    const existingMember = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId: inviteToken.boardId,
          userId: authReq.userId!,
        },
      },
    });

    const alreadyMember = !!existingMember;

    // Add user to board if not already a member
    if (!alreadyMember) {
      try {
        // Determine the role to assign (use stored role or default to viewer)
        const roleToAssign = inviteToken.role || 'viewer';

        // Create board member with the role from the invite token
        const newMember = await prisma.boardMember.create({
          data: {
            boardId: inviteToken.boardId,
            userId: authReq.userId!,
            role: roleToAssign,
          },
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        });

        // If a custom role was specified, assign it
        if (inviteToken.customRoleId) {
          await prisma.boardMemberCustomRole.create({
            data: {
              boardId: inviteToken.boardId,
              userId: authReq.userId!,
              customRoleId: inviteToken.customRoleId,
              boardMemberId: newMember.id,
            },
          });
        }

        // Automatically add user to workspace if not already a member
        const workspaceMembership = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: inviteToken.board.workspaceId,
              userId: authReq.userId!,
            },
          },
        });

        if (!workspaceMembership) {
          const newWorkspaceMember = await prisma.workspaceMember.create({
            data: {
              workspaceId: inviteToken.board.workspaceId,
              userId: authReq.userId!,
            },
          });

          // Emit workspace membership event
          await emitDatabaseChange('workspaceMembers', 'INSERT', newWorkspaceMember as any, undefined);
        }

        // Create audit log entry
        await prisma.boardMemberAuditLog.create({
          data: {
            boardId: inviteToken.boardId,
            action: 'added',
            targetUserId: authReq.userId!,
            actorUserId: inviteToken.createdBy,
            newRole: roleToAssign,
          },
        });

        // Emit board membership add event
        await emitDatabaseChange('boardMembers', 'INSERT', newMember as any, undefined, inviteToken.boardId);

        // Emit custom event for board member addition
        await emitCustomEvent(`board-${inviteToken.boardId}`, 'board.member.added', {
          boardId: inviteToken.boardId,
          userId: authReq.userId!,
          role: roleToAssign,
          customRoleId: inviteToken.customRoleId || undefined,
        });
      } catch (error: any) {
        // If adding member fails, log and return error
        console.error('[POST /invites/redeem] Error adding member:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userId: authReq.userId,
          boardId: inviteToken.boardId,
        });
        throw error;
      }
    }

    // Mark one-time token as used
    if (inviteToken.linkType === 'one_time' && !inviteToken.usedAt) {
      await prisma.boardInviteToken.update({
        where: { id: inviteToken.id },
        data: {
          usedAt: new Date(),
          usedBy: authReq.userId!,
        },
      });
    }

    // Determine the role message
    let roleMessage = 'viewer';
    if (inviteToken.customRoleId && inviteToken.customRole) {
      roleMessage = inviteToken.customRole.name;
    } else if (inviteToken.role) {
      roleMessage = inviteToken.role;
    }

    return res.json({
      success: true,
      boardId: inviteToken.boardId,
      alreadyMember,
      role: inviteToken.role || 'viewer',
      customRoleId: inviteToken.customRoleId || undefined,
      customRoleName: inviteToken.customRole?.name || undefined,
      message: alreadyMember 
        ? 'You are already a member of this board'
        : `You have been added to the board as ${roleMessage}`,
    });
  } catch (error) {
    console.error('[POST /invites/redeem] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as AuthRequest).userId,
      token: req.body?.token,
    });
    return next(error);
  }
});

export default router;

