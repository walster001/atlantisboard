import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { CARD_DESCRIPTION_JSON_MAX_LENGTH } from '../../shared/constants/cardDescription.js';
import { CARD_TITLE_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';
import { isValidCardDescriptionJsonString } from '../../shared/validation/cardDescriptionDoc.js';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { mapServiceErrorToHttp } from '../utils/mapServiceErrorToHttp.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  createCard,
  getCardById,
  getCardsByList,
  updateCard,
  deleteCard,
  duplicateCard,
  addCardAssignee,
  removeCardAssignee,
  addCardReminder,
  updateCardReminder,
  deleteCardReminder,
  dismissCardReminder,
  moveCard,
  reorderCards,
  type AddReminderInput,
  type UpdateReminderInput,
} from '../services/cardService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

function respondCardZodError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: error.issues,
      },
    });
    return true;
  }
  return false;
}

function handleCardRouteError(
  res: import('express').Response,
  error: unknown,
  next: (error: unknown) => void,
): void {
  if (respondCardZodError(res, error)) {
    return;
  }
  if (mapServiceErrorToHttp(res, error)) {
    return;
  }
  next(error);
}

const optionalCardDescriptionSchema = z
  .string()
  .max(CARD_DESCRIPTION_JSON_MAX_LENGTH)
  .refine((s) => s === '' || isValidCardDescriptionJsonString(s), {
    message: 'Invalid card description format',
  })
  .optional();

const createCardSchema = z.object({
  listId: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().min(1).max(CARD_TITLE_MAX_LENGTH),
  description: optionalCardDescriptionSchema,
  position: z.number().optional(),
});

const updateCardSchema = z.object({
  title: z.string().min(1).max(CARD_TITLE_MAX_LENGTH).optional(),
  description: optionalCardDescriptionSchema,
  listId: z.string().optional(),
  position: z.number().optional(),
  color: z.string().optional(),
  cover: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  completed: z.boolean().optional(),
});

const cardViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
});

const reorderCardsBulkReflowSchema = z.object({
  listId: z.string().min(1),
  cardIds: z.array(z.string().min(1)),
  mode: z.literal('bulk_reflow'),
});

// Create card
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createCardSchema.parse(req.body);
    const card = await createCard(validated, authReq.user.id);

    res.status(201).json({ card });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Get cards by list
router.get('/list/:listId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = cardViewQuerySchema.parse(req.query);
    const fields =
      typeof query.fields === 'string'
        ? query.fields
            .split(',')
            .map((field) => field.trim())
            .filter((field) => field !== '')
        : undefined;
    const options: { view?: 'summary' | 'detail'; fields?: string[] } = {};
    if (query.view !== undefined) {
      options.view = query.view;
    }
    if (fields !== undefined && fields.length > 0) {
      options.fields = fields;
    }
    const cards = await getCardsByList(req.params.listId, authReq.user.id, options);
    res.json({ cards });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Deprecated for interactive DnD; reserved for admin/bulk list reflow operations.
// Must be registered before PUT /:id or "reorder" is parsed as a card id.
router.put('/reorder', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { listId, cardIds, mode } = reorderCardsBulkReflowSchema.parse(req.body);

    const success = await reorderCards(listId, cardIds, authReq.user.id, { mode });
    if (!success) {
      res.status(404).json({
        error: {
          message: 'List not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    res.json({
      message: 'Cards reordered successfully (bulk reflow mode)',
      listId: String(listId),
      orderedCardIds: [...cardIds].map((id: unknown) => String(id)),
      mode,
      deprecatedForInteractiveDnD: true,
    });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Get card by ID
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = cardViewQuerySchema.parse(req.query);
    const options = query.view !== undefined ? { view: query.view } : undefined;
    const card = await getCardById(req.params.id, authReq.user.id, options);
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
    handleCardRouteError(res, error, next);
  }
});

// Update card
router.put('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateCardSchema.parse(req.body);
    const updateData: {
      title?: string | undefined;
      description?: string | undefined;
      listId?: string | undefined;
      position?: number | undefined;
      color?: string | undefined;
      cover?: string | undefined;
      dueDate?: Date | null | undefined;
      startDate?: Date | null | undefined;
      endDate?: Date | null | undefined;
      completed?: boolean | undefined;
    } = {};

    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.listId !== undefined) updateData.listId = validated.listId;
    if (validated.position !== undefined) updateData.position = validated.position;
    if (validated.color !== undefined) updateData.color = validated.color;
    if (validated.cover !== undefined) updateData.cover = validated.cover;
    if (validated.dueDate !== undefined) {
      updateData.dueDate = validated.dueDate === null ? null : new Date(validated.dueDate);
    }
    if (validated.startDate !== undefined) {
      updateData.startDate = validated.startDate === null ? null : new Date(validated.startDate);
    }
    if (validated.endDate !== undefined) {
      updateData.endDate = validated.endDate === null ? null : new Date(validated.endDate);
    }
    if (validated.completed !== undefined) updateData.completed = validated.completed;

    const card = await updateCard(req.params.id, updateData, authReq.user.id);
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
    handleCardRouteError(res, error, next);
  }
});

// Move card to different list
router.put('/:id/move', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { listId, position } = req.body;

    if (!listId || typeof position !== 'number') {
      res.status(400).json({
        error: {
          message: 'listId and position are required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    const card = await moveCard(req.params.id, listId, position, authReq.user.id);
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
    handleCardRouteError(res, error, next);
  }
});

// Delete card
router.delete('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const cardId = req.params.id;
    const deleted = await deleteCard(cardId, authReq.user.id);
    res.status(200).json({
      cardId,
      removed: deleted,
      message: deleted ? 'Card deleted successfully' : 'Card was already deleted',
    });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Duplicate card
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { targetListId } = req.body;
    if (!targetListId || typeof targetListId !== 'string') {
      res.status(400).json({
        error: {
          message: 'targetListId is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const duplicate = await duplicateCard(req.params.id, targetListId, authReq.user.id);
    if (!duplicate) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.status(201).json({ card: duplicate });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Add assignee to card
router.post('/:id/assignees', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        error: {
          message: 'userId is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const card = await addCardAssignee(req.params.id, userId, authReq.user.id);
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
    handleCardRouteError(res, error, next);
  }
});

// Remove assignee from card
router.delete('/:id/assignees/:userId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const card = await removeCardAssignee(req.params.id, req.params.userId, authReq.user.id);
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
    handleCardRouteError(res, error, next);
  }
});

const addReminderSchema = z.object({
  triggerAt: z.string().datetime(),
  repeatFrequency: z.string().optional(),
});

// Add reminder to card
router.post('/:id/reminders', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = addReminderSchema.parse(req.body);
    const input: AddReminderInput = {
      triggerAt: new Date(validated.triggerAt),
    };
    if (validated.repeatFrequency !== undefined) {
      input.repeatFrequency = validated.repeatFrequency;
    }
    const card = await addCardReminder(req.params.id, input, authReq.user.id);
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
    handleCardRouteError(res, error, next);
  }
});

const updateReminderSchema = z.object({
  triggerAt: z.string().datetime().optional(),
  repeatFrequency: z.string().optional(),
});

// Update card reminder
router.put('/:id/reminders/:reminderId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateReminderSchema.parse(req.body);
    const input: UpdateReminderInput = {};
    if (validated.triggerAt !== undefined) {
      input.triggerAt = new Date(validated.triggerAt);
    }
    if (validated.repeatFrequency !== undefined) {
      input.repeatFrequency = validated.repeatFrequency;
    }
    const card = await updateCardReminder(req.params.id, req.params.reminderId, input, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card or reminder not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Delete card reminder
router.delete('/:id/reminders/:reminderId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const card = await deleteCardReminder(req.params.id, req.params.reminderId, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card or reminder not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

// Dismiss card reminder
router.put('/:id/reminders/:reminderId/dismiss', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const card = await dismissCardReminder(req.params.id, req.params.reminderId, authReq.user.id);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card or reminder not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ card });
  } catch (error) {
    handleCardRouteError(res, error, next);
  }
});

export { router as cardRoutes };

