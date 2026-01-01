/**
 * Invite Routes - Board Invite Token Management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { realtimeEmitter } from '../realtime/emitter.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const generateInviteSchema = z.object({
  linkType: z.enum(['one_time', 'recurring']).default('one_time'),
});

/**
 * POST /api/boards/:boardId/invites/generate
 * Generate an invite token for a board
 */
router.post('/boards/:boardId/invites/generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { boardId } = req.params;
    const validated = generateInviteSchema.parse(req.body);
    const { linkType } = validated;

    // Check permission - must be board admin
    const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false, boardId);
    
    // Check if user can create invites (board admin)
    const canCreate = await prisma.$queryRaw<Array<{ can_create_board_invite: boolean }>>`
      SELECT can_create_board_invite(${req.userId!}::uuid, ${boardId}::uuid) as can_create_board_invite
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
        createdBy: req.userId!,
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

const redeemInviteSchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/invites/redeem
 * Redeem an invite token
 */
router.post('/redeem', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const validated = redeemInviteSchema.parse(req.body);
    const { token } = validated;

    // Call the database function to validate and redeem the token
    const result = await prisma.$queryRaw<Array<{
      success: boolean;
      error?: string;
      message?: string;
      already_member?: boolean;
      board_id?: string;
    }>>`
      SELECT * FROM validate_and_redeem_invite_token(${token}::text, ${req.userId!}::uuid)
    `;

    const redemptionResult = result[0];

    if (!redemptionResult.success) {
      const statusCode = redemptionResult.error === 'invalid_token' ? 404 
        : redemptionResult.error === 'expired' ? 410 
        : redemptionResult.error === 'already_used' ? 410 
        : redemptionResult.error === 'deleted' ? 410
        : 400;
      
      return res.status(statusCode).json({
        error: redemptionResult.error,
        message: redemptionResult.message,
        success: false,
      });
    }

    // Emit realtime event for board member addition
    if (redemptionResult.board_id && !redemptionResult.already_member) {
      realtimeEmitter.emitCustomEvent(`board-${redemptionResult.board_id}`, 'board.member.added', {
        boardId: redemptionResult.board_id,
        userId: req.userId!,
        role: 'viewer',
      });
    }

    res.json({
      success: true,
      boardId: redemptionResult.board_id,
      alreadyMember: redemptionResult.already_member || false,
      message: redemptionResult.message,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

