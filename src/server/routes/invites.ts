import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import {
  createInviteLink,
  acceptInviteLink,
  getInviteLinks,
  deleteInviteLink,
} from '../services/inviteService.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(requireAuth as RequestHandler);

// Special rate limiter for invite acceptance (300 per minute)
const inviteAcceptRateLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
});

const createInviteSchema = z.object({
  workspaceId: z.string().optional(),
  boardId: z.string().optional(),
  type: z.enum(['workspace', 'board']),
  inviteType: z.enum(['one-time', 'recurring']),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  roleKey: z.string().trim().min(1).max(80).optional(),
});

// Create invite link
router.post('/', apiRateLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createInviteSchema.parse(req.body);

    // Validate that workspaceId or boardId matches type
    if (validated.type === 'workspace' && !validated.workspaceId) {
      res.status(400).json({
        error: {
          message: 'Workspace ID is required for workspace invites',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    if (validated.type === 'board' && !validated.boardId) {
      res.status(400).json({
        error: {
          message: 'Board ID is required for board invites',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    const inviteInput: {
      workspaceId?: string;
      boardId?: string;
      type: 'workspace' | 'board';
      inviteType: 'one-time' | 'recurring';
      role?: 'admin' | 'manager' | 'viewer';
      roleKey?: string;
      createdBy: string;
    } = {
      type: validated.type,
      inviteType: validated.inviteType,
      ...(validated.role !== undefined ? { role: validated.role } : {}),
      ...(validated.roleKey !== undefined ? { roleKey: validated.roleKey } : {}),
      createdBy: authReq.user.id,
    };
    if (validated.workspaceId) {
      inviteInput.workspaceId = validated.workspaceId;
    }
    if (validated.boardId) {
      inviteInput.boardId = validated.boardId;
    }
    const inviteLink = await createInviteLink(inviteInput);

    res.status(201).json({ inviteLink });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

// Accept invite link
router.post('/accept/:token', inviteAcceptRateLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { token } = req.params;

    await acceptInviteLink(token, authReq.user.id);

    res.json({ message: 'Invite accepted successfully' });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid') || error.message.includes('expired') || error.message.includes('used')) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'INVALID_INVITE',
            statusCode: 400,
          },
        });
        return;
      }
    }
    next(error);
  }
});

// Get invite links
router.get('/', apiRateLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId, boardId } = req.query;

    const inviteLinks = await getInviteLinks(
      workspaceId as string | undefined,
      boardId as string | undefined,
      authReq.user.id
    );

    res.json({ inviteLinks });
  } catch (error) {
    next(error);
  }
});

// Delete invite link
router.delete('/:id', apiRateLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const deleted = await deleteInviteLink(req.params.id, authReq.user.id);

    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Invite link not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    res.json({ message: 'Invite link deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as inviteRoutes };

