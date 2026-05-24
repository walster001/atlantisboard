import { z } from 'zod';
import { ATLANTISBOARD_EXPORT_FORMAT_VERSION } from '../export/boardExportFormats.js';
import { sanitizeHtml } from '../utils/sanitizeHtml.js';

const attachmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    uploadedAt: z.string().optional(),
    uploadedBy: z.string().optional(),
    url: z.string().optional(),
    isPlaceholder: z.boolean().optional(),
    originalFileName: z.string().optional(),
  })
  .passthrough();

const checklistItemSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    completed: z.boolean().optional(),
    completedAt: z.union([z.string(), z.date()]).optional(),
    sortOrder: z.number().optional(),
  })
  .passthrough();

const checklistSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    items: z.array(checklistItemSchema).optional().default([]),
  })
  .passthrough();

const cardLabelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    color: z.string(),
  })
  .passthrough();

const cardSchema = z
  .object({
    id: z.string().min(1),
    listId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    descriptionHtml: z.string().optional(),
    descriptionPreview: z.string().optional(),
    descriptionCharCount: z.number().optional(),
    position: z.number().optional(),
    pos: z.number().optional(),
    color: z.string().optional(),
    cover: z.string().optional(),
    labels: z.array(cardLabelSchema).optional().default([]),
    dueDate: z.union([z.string(), z.date()]).optional(),
    startDate: z.union([z.string(), z.date()]).optional(),
    endDate: z.union([z.string(), z.date()]).optional(),
    completed: z.boolean().optional(),
    completedAt: z.union([z.string(), z.date()]).optional(),
    assignees: z.array(z.string()).optional().default([]),
    reminders: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    checklists: z.array(checklistSchema).optional().default([]),
    comments: z
      .array(
        z
          .object({
            id: z.string().min(1),
            userId: z.string().min(1),
            text: z.string(),
            createdAt: z.union([z.string(), z.date()]),
            updatedAt: z.union([z.string(), z.date()]).optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    attachments: z.array(attachmentSchema).optional().default([]),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
    createdBy: z.string().optional(),
  })
  .passthrough();

const listSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    position: z.number().optional(),
    color: z.string().optional(),
  })
  .passthrough();

const labelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    color: z.string(),
    isPredefined: z.boolean().optional(),
  })
  .passthrough();

const boardSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    background: z.string().optional(),
    visibility: z.enum(['private', 'workspace', 'public']).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    ownerId: z.string().optional(),
    members: z
      .array(
        z
          .object({
            userId: z.string().min(1),
            roleKey: z.string().min(1),
            addedAt: z.union([z.string(), z.date()]).optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

const exportSchema = z
  .object({
    format: z.string().optional(),
    board: boardSchema,
    lists: z.array(listSchema).min(1),
    cards: z.array(cardSchema).optional().default([]),
    labels: z.array(labelSchema).optional().default([]),
    exportedAt: z.string().optional(),
  })
  .passthrough();

export type NormalizedAtlantisboardExport = z.infer<typeof exportSchema>;

export function isAtlantisboardExportShape(raw: unknown): boolean {
  const record =
    raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (record == null) {
    return false;
  }
  const format = typeof record.format === 'string' ? record.format.trim() : '';
  const board = record.board;
  const lists = record.lists;
  if (format === ATLANTISBOARD_EXPORT_FORMAT_VERSION) {
    return (
      board != null &&
      typeof board === 'object' &&
      !Array.isArray(board) &&
      Array.isArray(lists) &&
      lists.length > 0
    );
  }
  const cards = record.cards;
  if (board == null || typeof board !== 'object' || Array.isArray(board)) {
    return false;
  }
  if (!Array.isArray(lists) || lists.length === 0) {
    return false;
  }
  const firstList = lists[0];
  if (firstList == null || typeof firstList !== 'object' || Array.isArray(firstList)) {
    return false;
  }
  const listRecord = firstList as Record<string, unknown>;
  if (typeof listRecord.name !== 'string') {
    return false;
  }
  const boardRecord = board as Record<string, unknown>;
  if (boardRecord.settings == null || typeof boardRecord.settings !== 'object') {
    return false;
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return format === ATLANTISBOARD_EXPORT_FORMAT_VERSION;
  }
  const firstCard = cards[0];
  if (firstCard == null || typeof firstCard !== 'object' || Array.isArray(firstCard)) {
    return false;
  }
  const cardRecord = firstCard as Record<string, unknown>;
  return typeof cardRecord.title === 'string' && typeof cardRecord.listId === 'string';
}

export class AtlantisboardExportShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtlantisboardExportShapeError';
  }
}

export function assertAtlantisboardExportShape(raw: unknown): void {
  if (!isAtlantisboardExportShape(raw)) {
    throw new AtlantisboardExportShapeError(
      'This file is not a valid Atlantisboard board export. Choose “Atlantisboard JSON”, or export a board from this app first.',
    );
  }
}

export function normalizeAtlantisboardExport(raw: unknown): NormalizedAtlantisboardExport {
  assertAtlantisboardExportShape(raw);
  const parsed = exportSchema.parse(raw);
  return {
    ...parsed,
    cards: parsed.cards.map((card) => ({
      ...card,
      ...(card.descriptionHtml != null && card.descriptionHtml !== ''
        ? { descriptionHtml: sanitizeHtml(card.descriptionHtml) }
        : {}),
    })),
  };
}

export function parseDataUrl(dataUrl: string): { readonly mimeType: string; readonly buffer: Buffer } | null {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,([\s\S]+)$/u.exec(trimmed);
  if (match == null) {
    return null;
  }
  const mimeType = match[1]?.trim() ?? 'application/octet-stream';
  const encoded = match[2]?.replace(/\s+/g, '') ?? '';
  if (encoded === '') {
    return null;
  }
  try {
    return { mimeType, buffer: Buffer.from(encoded, 'base64') };
  } catch {
    return null;
  }
}

function toDate(value: string | Date | undefined): Date | undefined {
  if (value == null) {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export { toDate as atlantisboardImportToDate };
