import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  addCardReminder,
  updateCardReminder,
  deleteCardReminder,
  dismissCardReminder,
  type AddReminderInput,
  type UpdateReminderInput,
} from '../../services/cardService.js';
import {
  addReminderSchema,
  handleCardRouteError,
  parseOrThrow,
  updateReminderSchema,
} from './_helpers.js';

export function registerCardRemindersRoutes(router: Router): void {
  router.post('/:id/reminders', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(addReminderSchema, req.body);
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

  router.put('/:id/reminders/:reminderId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(updateReminderSchema, req.body);
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
}
