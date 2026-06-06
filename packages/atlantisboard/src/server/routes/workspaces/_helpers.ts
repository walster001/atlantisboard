import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  activityLogRetentionDays: z.number().min(1).max(365).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  roleKey: z.string().trim().min(1).max(80).optional(),
});

export const workspaceViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
});

export function selectFields(items: unknown[], fieldsCsv: string | undefined): unknown[] {
  if (fieldsCsv === undefined || fieldsCsv.trim() === '') {
    return items;
  }
  const fields = fieldsCsv
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '');
  if (fields.length === 0) {
    return items;
  }
  return items.map((item) => {
    if (item == null || typeof item !== 'object') {
      return item;
    }
    const obj = item as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in obj) {
        selected[field] = obj[field];
      }
    }
    if ('id' in obj) {
      selected.id = obj.id;
    }
    return selected;
  });
}
