import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { parseOrThrow } from '../utils/zodValidation.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
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
    handleApiRouteError(res, error, next);
  }
});

// Create label
router.post('/boards/:boardId/labels', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(createLabelSchema, req.body);
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
    handleApiRouteError(res, error, next);
  }
});

// Update label
router.put('/boards/:boardId/labels/:labelId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(updateLabelSchema, req.body);
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
    handleApiRouteError(res, error, next);
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
    handleApiRouteError(res, error, next);
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
    handleApiRouteError(res, error, next);
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
    handleApiRouteError(res, error, next);
  }
});

export { router as labelRoutes };
