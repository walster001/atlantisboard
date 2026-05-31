import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  createLabel,
  getBoardLabels,
  updateLabel,
  deleteLabel,
  assignLabelToCard,
  removeLabelFromCard,
} from '../services/labelService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

function isInvalidMongoIdError(error: unknown): error is Error {
  return error instanceof Error && /^Invalid (label id|card id)/.test(error.message);
}

const createLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isPredefined: z.boolean().optional(),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// Get all labels for a board
router.get('/boards/:boardId/labels', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const labels = await getBoardLabels(req.params.boardId, authReq.user.id);
    res.json({ labels });
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

// Create label
router.post('/boards/:boardId/labels', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createLabelSchema.parse(req.body);
    const labelInput: {
      boardId: string;
      name: string;
      color: string;
      isPredefined?: boolean;
    } = {
      boardId: req.params.boardId,
      name: validated.name,
      color: validated.color,
    };
    if (validated.isPredefined !== undefined) {
      labelInput.isPredefined = validated.isPredefined;
    }
    const label = await createLabel(labelInput, authReq.user.id);

    res.status(201).json({ label });
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

// Update label
router.put('/boards/:boardId/labels/:labelId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateLabelSchema.parse(req.body);
    const updateInput: { name?: string; color?: string } = {};
    if (validated.name !== undefined) {
      updateInput.name = validated.name;
    }
    if (validated.color !== undefined) {
      updateInput.color = validated.color;
    }
    const label = await updateLabel(req.params.labelId, updateInput, authReq.user.id);
    if (!label) {
      res.status(404).json({
        error: {
          message: 'Label not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ label });
  } catch (error) {
    if (isInvalidMongoIdError(error)) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'BAD_REQUEST',
          statusCode: 400,
        },
      });
      return;
    }
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

// Delete label
router.delete('/boards/:boardId/labels/:labelId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const deleted = await deleteLabel(req.params.labelId, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Label not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Label deleted successfully' });
  } catch (error) {
    if (isInvalidMongoIdError(error)) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'BAD_REQUEST',
          statusCode: 400,
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

// Assign label to card
router.post('/cards/:cardId/labels/:labelId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const card = await assignLabelToCard(req.params.cardId, req.params.labelId, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    if (isInvalidMongoIdError(error)) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'BAD_REQUEST',
          statusCode: 400,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: {
          message: error.message,
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    next(error);
  }
});

// Remove label from card
router.delete('/cards/:cardId/labels/:labelId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const card = await removeLabelFromCard(req.params.cardId, req.params.labelId, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    if (isInvalidMongoIdError(error)) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'BAD_REQUEST',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as labelRoutes };

