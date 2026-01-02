/**
 * Invite Routes - Board Invite Token Management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { ForbiddenError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { emitCustomEvent } from '../realtime/emitter.js';

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
router.post('/boards/:boardId/invites/generate', async (req: Request, res: Response, next: NextFunction) => {
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

    // Call the database function to validate and redeem the token
    const result = await prisma.$queryRaw<Array<{
      success: boolean;
      error?: string;
      message?: string;
      already_member?: boolean;
      board_id?: string;
    }>>`
      SELECT * FROM validate_and_redeem_invite_token(${token}::text, ${authReq.userId!}::uuid)
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
      await emitCustomEvent(`board-${redemptionResult.board_id}`, 'board.member.added', {
        boardId: redemptionResult.board_id,
        userId: authReq.userId!,
        role: 'viewer',
      });
    }

    return res.json({
      success: true,
      boardId: redemptionResult.board_id,
      alreadyMember: redemptionResult.already_member || false,
      message: redemptionResult.message,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

