import { z } from 'zod';

export const workspaceSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string()
    .trim()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable(),
});

export const boardSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
});

export const columnSchema = z.object({
  title: z.string()
    .trim()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
});

export const cardSchema = z.object({
  title: z.string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  description: z.string()
    .trim()
    .max(5000, 'Description must be less than 5000 characters')
    .optional()
    .nullable(),
});

export const emailSchema = z.string()
  .trim()
  .email('Invalid email format')
  .toLowerCase();
