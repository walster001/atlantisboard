/**
 * Invite Routes - Token Redemption
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { emitCustomEvent } from '../realtime/emitter.js';

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

