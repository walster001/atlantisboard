import { z } from 'zod';

const NESTED_BOARD_KEYS = new Set([
  'cards',
  'lists',
  'labels',
  'actions',
  'checklists',
  'members',
  'customFields',
  'pluginData',
]);

const trelloCheckItemSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    state: z.union([z.literal('complete'), z.literal('incomplete'), z.string()]),
  })
  .passthrough();

const trelloChecklistSchema = z
  .object({
    id: z.string(),
    idCard: z.string(),
    idBoard: z.string().optional(),
    name: z.string(),
    checkItems: z.array(trelloCheckItemSchema).optional().default([]),
  })
  .passthrough();

const trelloLabelSchema = z
  .object({
    id: z.string(),
    idBoard: z.string().optional(),
    name: z.string().optional(),
    color: z.string().nullable().optional(),
  })
  .passthrough();

const trelloListSchema = z
  .object({
    id: z.string(),
    name: z
      .union([z.string(), z.null()])
      .transform((n) => (typeof n === 'string' && n.trim().length > 0 ? n.trim() : 'Untitled list')),
    idBoard: z.string(),
    pos: z.number().nullish().transform((p) => (typeof p === 'number' && Number.isFinite(p) ? p : 0)),
    closed: z.boolean().optional(),
  })
  .passthrough();

const trelloAttachmentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    mimeType: z.string().nullable().optional(),
    bytes: z.number().nullable().optional(),
    date: z.string(),
  })
  .passthrough();

const trelloCommentSchema = z
  .object({
    id: z.string(),
    data: z.object({ text: z.string() }),
    memberCreator: z
      .object({
        email: z.string().optional(),
        fullName: z.string().optional(),
      })
      .passthrough(),
    date: z.string(),
  })
  .passthrough();

const trelloCardSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    desc: z.string().nullable().optional(),
    idList: z.string(),
    idBoard: z.string(),
    pos: z.number(),
    closed: z.boolean().optional(),
    due: z.string().nullable().optional(),
    dueComplete: z.boolean().optional(),
    start: z.string().nullable().optional(),
    cover: z.record(z.string(), z.unknown()).optional(),
    idLabels: z.array(z.string()).optional(),
    labels: z.array(trelloLabelSchema).optional(),
    idMembers: z.array(z.string()).optional(),
    idChecklists: z.array(z.string()).optional(),
    attachments: z.array(trelloAttachmentSchema).optional(),
    checklists: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            checkItems: z.array(trelloCheckItemSchema),
          })
          .passthrough()
      )
      .optional(),
    comments: z.array(trelloCommentSchema).optional(),
  })
  .passthrough();

const trelloBoardSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    desc: z.string().optional(),
    closed: z.boolean().optional(),
    idOrganization: z.string().optional(),
    prefs: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const trelloOrgSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
    desc: z.string().optional(),
  })
  .passthrough();

const trelloMemberSchema = z
  .object({
    id: z.string(),
    email: z.string().optional(),
    username: z.string().optional(),
    fullName: z.string().optional(),
  })
  .passthrough();

export type TrelloNormalizedBoard = z.infer<typeof trelloBoardSchema>;
export type TrelloNormalizedList = z.infer<typeof trelloListSchema>;
export type TrelloNormalizedCard = z.infer<typeof trelloCardSchema>;
export type TrelloNormalizedLabel = z.infer<typeof trelloLabelSchema>;
export type TrelloNormalizedChecklist = z.infer<typeof trelloChecklistSchema>;
export type TrelloNormalizedMember = z.infer<typeof trelloMemberSchema>;
export type TrelloNormalizedOrg = z.infer<typeof trelloOrgSchema>;

export interface NormalizedTrelloExport {
  readonly organizations?: readonly TrelloNormalizedOrg[];
  readonly boards: readonly TrelloNormalizedBoard[];
  readonly lists: readonly TrelloNormalizedList[];
  readonly cards: readonly TrelloNormalizedCard[];
  readonly labels?: readonly TrelloNormalizedLabel[];
  readonly members?: readonly TrelloNormalizedMember[];
  readonly checklists: readonly TrelloNormalizedChecklist[];
}

function stripToBoardRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const board: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!NESTED_BOARD_KEYS.has(key)) {
      board[key] = value;
    }
  }
  return board;
}

/**
 * Accepts legacy multi-board JSON or modern single-board-at-root export.
 */
export function normalizeTrelloExport(raw: unknown): NormalizedTrelloExport {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Trello import: expected a JSON object at the root.');
  }

  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const organizations =
      o.organizations !== undefined
        ? z.array(trelloOrgSchema).parse(o.organizations)
        : undefined;
    const boards = z.array(trelloBoardSchema).parse(o.boards);
    const lists = z.array(trelloListSchema).parse(o.lists ?? []);
    const cards = z.array(trelloCardSchema).parse(o.cards ?? []);
    const labels =
      o.labels !== undefined ? z.array(trelloLabelSchema).parse(o.labels) : undefined;
    const members =
      o.members !== undefined ? z.array(trelloMemberSchema).parse(o.members) : undefined;
    const checklists = z.array(trelloChecklistSchema).parse(o.checklists ?? []);
    return {
      ...(organizations !== undefined && organizations.length > 0 ? { organizations } : {}),
      boards,
      lists,
      cards,
      ...(labels !== undefined && labels.length > 0 ? { labels } : {}),
      ...(members !== undefined && members.length > 0 ? { members } : {}),
      checklists,
    };
  }

  const hasBoardId = typeof o.id === 'string';
  const hasLists = Array.isArray(o.lists);
  const hasCards = Array.isArray(o.cards);
  if (hasBoardId && (hasLists || hasCards)) {
    const board = trelloBoardSchema.parse(stripToBoardRecord(o));
    const lists = z.array(trelloListSchema).parse(o.lists ?? []);
    const cards = z.array(trelloCardSchema).parse(o.cards ?? []);
    const labels =
      o.labels !== undefined ? z.array(trelloLabelSchema).parse(o.labels) : undefined;
    const members =
      o.members !== undefined ? z.array(trelloMemberSchema).parse(o.members) : undefined;
    const checklists = z.array(trelloChecklistSchema).parse(o.checklists ?? []);
    return {
      boards: [board],
      lists,
      cards,
      ...(labels !== undefined && labels.length > 0 ? { labels } : {}),
      ...(members !== undefined && members.length > 0 ? { members } : {}),
      checklists,
    };
  }

  throw new Error(
    'Trello import: unrecognized JSON. Expected a "boards" array or a single board object with "id" and "lists"/"cards".'
  );
}
