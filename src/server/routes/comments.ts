import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { parseOrThrow } from '../utils/zodValidation.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  createComment,
  updateComment,
  deleteComment,
} from '../services/commentService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const createCommentSchema = z.object({
  cardId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

const updateCommentSchema = z.object({
  cardId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

const deleteCommentBodySchema = z.object({
  cardId: z.string().min(1),
});

// Create comment
router.post('/comments', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(createCommentSchema, req.body);
    const card = await createComment(validated, authReq.user.id);

    res.status(201).json({ card });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

// Update comment
router.put('/comments/:commentId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(updateCommentSchema, req.body);
    const card = await updateComment(
      validated.cardId,
      req.params.commentId,
      { text: validated.text },
      authReq.user.id,
    );
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Comment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

// Delete comment
router.delete('/comments/:commentId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId } = parseOrThrow(deleteCommentBodySchema, req.body);
    const deleted = await deleteComment(cardId, req.params.commentId, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Comment not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as commentRoutes };
