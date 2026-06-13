import { z } from 'zod';
import { BOARD_DAY_LOG_RETENTION_QUERY_VALUES } from '../../../shared/boardDayLogRetention.js';
import {
  ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE,
  ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';

const mongoObjectIdSchema = z.string().trim().regex(/^[a-fA-F0-9]{24}$/);

export { mongoObjectIdSchema };

export const memberActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
  retention: z.enum(BOARD_DAY_LOG_RETENTION_QUERY_VALUES).optional(),
  boardId: mongoObjectIdSchema.optional(),
});

export const boardActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
  retention: z.enum(BOARD_DAY_LOG_RETENTION_QUERY_VALUES).optional(),
  boardId: mongoObjectIdSchema.optional(),
});

export const boardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_BOARD_LIST_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
});

export const cardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_REPORTING_CARD_LIST_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
});
