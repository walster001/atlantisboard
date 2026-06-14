import { z } from 'zod';
import {
  ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_DAYS_FILTER_VALUES,
  ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';

const mongoObjectIdSchema = z.string().trim().regex(/^[a-fA-F0-9]{24}$/);

export { mongoObjectIdSchema };

const daysFilterSchema = z.enum(ADMIN_REPORTING_DAYS_FILTER_VALUES).optional();

export const memberActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
  days: daysFilterSchema,
  boardId: mongoObjectIdSchema.optional(),
});

export const boardActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
  days: daysFilterSchema,
  boardId: mongoObjectIdSchema.optional(),
});

export const activityCleanupBodySchema = z.object({
  olderThanDays: z.number().int().min(1).max(3650),
});

export const boardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
});

export const cardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
});
