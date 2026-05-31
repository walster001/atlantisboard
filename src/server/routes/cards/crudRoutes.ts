import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  createCard,
  getCardById,
  getCardsByList,
  updateCard,
  deleteCard,
  duplicateCard,
  moveCard,
} from '../../services/cardService.js';
import {
  cardViewQuerySchema,
  createCardSchema,
  handleCardRouteError,
  updateCardSchema,
} from './_helpers.js';

export function registerCardCollectionRoutes(router: Router): void {
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
}

export function registerCardItemRoutes(router: Router): void {
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
}
