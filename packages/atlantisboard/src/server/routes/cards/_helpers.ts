import { z } from 'zod';
import { CARD_DESCRIPTION_JSON_MAX_LENGTH } from '../../../shared/constants/cardDescription.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../shared/constants/entityTextLimits.js';
import { isValidCardDescriptionJsonString } from '../../../shared/validation/cardDescriptionDoc.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';

export function handleCardRouteError(
  res: import('express').Response,
  error: unknown,
  next: (error: unknown) => void,
): void {
  handleApiRouteError(res, error, next);
}

const optionalCardDescriptionSchema = z
  .string()
  .max(CARD_DESCRIPTION_JSON_MAX_LENGTH)
  .refine((s) => s === '' || isValidCardDescriptionJsonString(s), {
    message: 'Invalid card description format',
  })
  .optional();

export const createCardSchema = z.object({
  listId: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().min(1).max(CARD_TITLE_MAX_LENGTH),
  description: optionalCardDescriptionSchema,
  position: z.number().optional(),
});

export const updateCardSchema = z.object({
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

export const cardViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
});

export const reorderCardsBulkReflowSchema = z.object({
  listId: z.string().min(1),
  cardIds: z.array(z.string().min(1)),
  mode: z.literal('bulk_reflow'),
});

export const addReminderSchema = z.object({
  triggerAt: z.string().datetime(),
  repeatFrequency: z.string().optional(),
});

export const updateReminderSchema = z.object({
  triggerAt: z.string().datetime().optional(),
  repeatFrequency: z.string().optional(),
});
