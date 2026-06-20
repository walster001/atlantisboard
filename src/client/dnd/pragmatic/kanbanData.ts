/** Discriminator merged into drop-target data (with hitbox `attachClosestEdge`). */
export const PDND_KANBAN_CARD = 'kanban-card' as const;
export const PDND_KANBAN_LIST = 'kanban-list' as const;
export const PDND_KANBAN_LIST_BODY = 'kanban-list-body' as const;
export const PDND_KANBAN_LIST_COLUMN = 'kanban-list-column' as const;

export type KanbanCardDragData = {
  readonly kind: 'kanban-card';
  readonly cardId: string;
  readonly listId: string;
};

export type KanbanListDragData = {
  readonly kind: 'kanban-list';
  readonly listId: string;
  readonly title: string;
};

export type KanbanListBodyDropData = {
  readonly kind: 'kanban-list-body';
  readonly listId: string;
};

export type KanbanListColumnDropData = {
  readonly kind: 'kanban-list-column';
  readonly listId: string;
};

function readListIdDrop<K extends KanbanListBodyDropData['kind'] | KanbanListColumnDropData['kind']>(
  data: Record<string, unknown>,
  kind: K,
): { readonly kind: K; readonly listId: string } | null {
  if (data.kind !== kind) {
    return null;
  }
  const listId = data.listId;
  return typeof listId === 'string' ? { kind, listId } : null;
}

export function readKanbanCardDragData(data: Record<string, unknown>): KanbanCardDragData | null {
  if (data.kind !== 'kanban-card') {
    return null;
  }
  const cardId = data.cardId;
  const listId = data.listId;
  if (typeof cardId !== 'string' || typeof listId !== 'string') {
    return null;
  }
  return { kind: 'kanban-card', cardId, listId };
}

export function readKanbanListDragData(data: Record<string, unknown>): KanbanListDragData | null {
  if (data.kind !== 'kanban-list') {
    return null;
  }
  const listId = data.listId;
  const title = data.title;
  if (typeof listId !== 'string' || typeof title !== 'string') {
    return null;
  }
  return { kind: 'kanban-list', listId, title };
}

export function readKanbanListBodyDropData(data: Record<string, unknown>): KanbanListBodyDropData | null {
  return readListIdDrop(data, 'kanban-list-body');
}

export function readKanbanListColumnDropData(data: Record<string, unknown>): KanbanListColumnDropData | null {
  return readListIdDrop(data, 'kanban-list-column');
}
