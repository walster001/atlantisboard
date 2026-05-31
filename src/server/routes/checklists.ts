import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  createChecklist,
  updateChecklist,
  deleteChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from '../services/checklistService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const createChecklistSchema = z.object({
  cardId: z.string().min(1),
  title: z.string().min(1).max(100),
});

const updateChecklistSchema = z.object({
  title: z.string().min(1).max(100).optional(),
});

const createChecklistItemSchema = z.object({
  cardId: z.string().min(1),
  checklistId: z.string().min(1),
  text: z.string().min(1).max(500),
  sortOrder: z.number().optional(),
});

const updateChecklistItemSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

// Create checklist
router.post('/checklists', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createChecklistSchema.parse(req.body);
    const card = await createChecklist(validated, authReq.user.id);

    res.status(201).json({ card });
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

// Update checklist
router.put('/checklists/:checklistId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateChecklistSchema.parse(req.body);
    const { cardId } = req.body;
    if (!cardId || typeof cardId !== 'string') {
      res.status(400).json({
        error: {
          message: 'cardId is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const updateInput: { title?: string } = {};
    if (validated.title !== undefined) {
      updateInput.title = validated.title;
    }
    const card = await updateChecklist(cardId, req.params.checklistId, updateInput, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Checklist not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
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

// Delete checklist
router.delete('/checklists/:checklistId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId } = req.body;
    if (!cardId || typeof cardId !== 'string') {
      res.status(400).json({
        error: {
          message: 'cardId is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const deleted = await deleteChecklist(cardId, req.params.checklistId, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Checklist not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Checklist deleted successfully' });
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

// Create checklist item
router.post('/checklists/items', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createChecklistItemSchema.parse(req.body);
    const itemInput: {
      cardId: string;
      checklistId: string;
      text: string;
      sortOrder?: number;
    } = {
      cardId: validated.cardId,
      checklistId: validated.checklistId,
      text: validated.text,
    };
    if (validated.sortOrder !== undefined) {
      itemInput.sortOrder = validated.sortOrder;
    }
    const card = await createChecklistItem(itemInput, authReq.user.id);
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
    res.status(201).json({ card });
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

// Update checklist item
router.put('/checklists/items/:itemId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateChecklistItemSchema.parse(req.body);
    const { cardId, checklistId } = req.body;
    if (!cardId || typeof cardId !== 'string' || !checklistId || typeof checklistId !== 'string') {
      res.status(400).json({
        error: {
          message: 'cardId and checklistId are required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const updateInput: {
      text?: string;
      completed?: boolean;
      sortOrder?: number;
    } = {};
    if (validated.text !== undefined) {
      updateInput.text = validated.text;
    }
    if (validated.completed !== undefined) {
      updateInput.completed = validated.completed;
    }
    if (validated.sortOrder !== undefined) {
      updateInput.sortOrder = validated.sortOrder;
    }
    const card = await updateChecklistItem(cardId, checklistId, req.params.itemId, updateInput, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Checklist item not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
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

// Delete checklist item
router.delete('/checklists/items/:itemId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId, checklistId } = req.body;
    if (!cardId || typeof cardId !== 'string' || !checklistId || typeof checklistId !== 'string') {
      res.status(400).json({
        error: {
          message: 'cardId and checklistId are required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const deleted = await deleteChecklistItem(cardId, checklistId, req.params.itemId, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Checklist item not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Checklist item deleted successfully' });
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

export { router as checklistRoutes };

