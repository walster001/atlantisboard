/** Stored as Activity.type for board content CRUD events. */
export const BOARD_CONTENT_ACTIVITY_TYPES = [
  'list.created',
  'list.updated',
  'list.deleted',
  'list.reordered',
  'list.duplicated',
  'card.created',
  'card.updated',
  'card.deleted',
  'card.moved',
  'card.reordered',
  'card.duplicated',
  'card.description.updated',
  'checklist.created',
  'checklist.updated',
  'checklist.deleted',
  'checklist.item.created',
  'checklist.item.updated',
  'checklist.item.deleted',
  'attachment.uploaded',
  'attachment.deleted',
  'label.created',
  'label.updated',
  'label.deleted',
  'label.assigned',
  'label.removed',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'card.assignee.added',
  'card.assignee.removed',
  'card.reminder.created',
  'card.reminder.updated',
  'card.reminder.deleted',
  'card.reminder.dismissed',
  'card.dates.updated',
] as const;

export type BoardContentActivityType = (typeof BOARD_CONTENT_ACTIVITY_TYPES)[number];

export type BoardActivityTrackingCategory =
  | 'lists'
  | 'cards'
  | 'cardDescriptions'
  | 'checklists'
  | 'attachments'
  | 'labels'
  | 'comments'
  | 'assignees'
  | 'reminders'
  | 'dates';

export const BOARD_ACTIVITY_TRACKING_CATEGORIES: ReadonlyArray<{
  readonly key: BoardActivityTrackingCategory;
  readonly label: string;
  readonly description: string;
}> = [
  { key: 'lists', label: 'Lists', description: 'Create, update, delete, reorder, and duplicate lists' },
  { key: 'cards', label: 'Cards', description: 'Create, update, delete, move, reorder, and duplicate cards' },
  {
    key: 'cardDescriptions',
    label: 'Card descriptions',
    description: 'Changes to card description text',
  },
  { key: 'checklists', label: 'Checklists', description: 'Checklists and checklist items' },
  { key: 'attachments', label: 'Attachments', description: 'File uploads and deletions' },
  { key: 'labels', label: 'Labels', description: 'Label management and card assignments' },
  { key: 'comments', label: 'Comments', description: 'Card comments (can be noisy on active boards)' },
  { key: 'assignees', label: 'Assignees', description: 'Adding and removing card assignees' },
  { key: 'reminders', label: 'Reminders', description: 'Card reminder create, update, delete, and dismiss' },
  { key: 'dates', label: 'Dates', description: 'Start, due, end, and completed date changes' },
] as const;

export type BoardActivityTrackingSettings = {
  readonly lists?: boolean | undefined;
  readonly cards?: boolean | undefined;
  readonly cardDescriptions?: boolean | undefined;
  readonly checklists?: boolean | undefined;
  readonly attachments?: boolean | undefined;
  readonly labels?: boolean | undefined;
  readonly comments?: boolean | undefined;
  readonly assignees?: boolean | undefined;
  readonly reminders?: boolean | undefined;
  readonly dates?: boolean | undefined;
};

export const DEFAULT_BOARD_ACTIVITY_TRACKING: Readonly<
  Record<BoardActivityTrackingCategory, boolean>
> = {
  lists: true,
  cards: true,
  cardDescriptions: true,
  checklists: true,
  attachments: true,
  labels: true,
  comments: false,
  assignees: true,
  reminders: true,
  dates: true,
};

/** Default expiry for board content activity rows when board setting is unset. */
export const BOARD_CONTENT_DEFAULT_RETENTION_DAYS = 30;

const BOARD_CONTENT_ACTIVITY_TYPE_SET = new Set<string>(BOARD_CONTENT_ACTIVITY_TYPES);

export function isBoardContentActivityType(type: string): type is BoardContentActivityType {
  return BOARD_CONTENT_ACTIVITY_TYPE_SET.has(type);
}

export const BOARD_ACTIVITY_TRACKING_CATEGORY_KEYS = BOARD_ACTIVITY_TRACKING_CATEGORIES.map(
  (entry) => entry.key,
) as ReadonlyArray<BoardActivityTrackingCategory>;

/** Maps each activity type to its tracking category toggle. */
export const BOARD_CONTENT_ACTIVITY_CATEGORY_BY_TYPE: Readonly<
  Record<BoardContentActivityType, BoardActivityTrackingCategory>
> = {
  'list.created': 'lists',
  'list.updated': 'lists',
  'list.deleted': 'lists',
  'list.reordered': 'lists',
  'list.duplicated': 'lists',
  'card.created': 'cards',
  'card.updated': 'cards',
  'card.deleted': 'cards',
  'card.moved': 'cards',
  'card.reordered': 'cards',
  'card.duplicated': 'cards',
  'card.description.updated': 'cardDescriptions',
  'checklist.created': 'checklists',
  'checklist.updated': 'checklists',
  'checklist.deleted': 'checklists',
  'checklist.item.created': 'checklists',
  'checklist.item.updated': 'checklists',
  'checklist.item.deleted': 'checklists',
  'attachment.uploaded': 'attachments',
  'attachment.deleted': 'attachments',
  'label.created': 'labels',
  'label.updated': 'labels',
  'label.deleted': 'labels',
  'label.assigned': 'labels',
  'label.removed': 'labels',
  'comment.created': 'comments',
  'comment.updated': 'comments',
  'comment.deleted': 'comments',
  'card.assignee.added': 'assignees',
  'card.assignee.removed': 'assignees',
  'card.reminder.created': 'reminders',
  'card.reminder.updated': 'reminders',
  'card.reminder.deleted': 'reminders',
  'card.reminder.dismissed': 'reminders',
  'card.dates.updated': 'dates',
};

/** Returns whether a category is tracked; unset toggles fall back to defaults. */
export function boardActivityTrackingEnabled(
  tracking: BoardActivityTrackingSettings | undefined,
  category: BoardActivityTrackingCategory,
): boolean {
  const configured = tracking?.[category];
  if (configured !== undefined) {
    return configured === true;
  }
  return DEFAULT_BOARD_ACTIVITY_TRACKING[category];
}
