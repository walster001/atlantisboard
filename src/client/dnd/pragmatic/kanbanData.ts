/** Discriminator merged into drop-target data (with hitbox `attachClosestEdge`). */
export const PDND_KANBAN_CARD = 'kanban-card' as const;
export const PDND_KANBAN_CARD_DROP = 'kanban-card-drop' as const;
export const PDND_KANBAN_LIST = 'kanban-list' as const;
export const PDND_KANBAN_LIST_BODY = 'kanban-list-body' as const;
export const PDND_KANBAN_LIST_COLUMN = 'kanban-list-column' as const;

export type KanbanCardDragData = {
  readonly kind: 'kanban-card';
  readonly cardId: string;
  readonly listId: string;
};

export type KanbanCardDropData = {
  readonly kind: 'kanban-card-drop';
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

export function readKanbanCardDropData(data: Record<string, unknown>): KanbanCardDropData | null {
  if (data.kind !== 'kanban-card-drop') {
    return null;
  }
  const cardId = data.cardId;
  const listId = data.listId;
  if (typeof cardId !== 'string' || typeof listId !== 'string') {
    return null;
  }
  return { kind: 'kanban-card-drop', cardId, listId };
}

export function readKanbanListBodyDropData(data: Record<string, unknown>): KanbanListBodyDropData | null {
  if (data.kind !== 'kanban-list-body') {
    return null;
  }
  const listId = data.listId;
  if (typeof listId !== 'string') {
    return null;
  }
  return { kind: 'kanban-list-body', listId };
}

export function readKanbanListColumnDropData(data: Record<string, unknown>): KanbanListColumnDropData | null {
  if (data.kind !== 'kanban-list-column') {
    return null;
  }
  const listId = data.listId;
  if (typeof listId !== 'string') {
    return null;
  }
  return { kind: 'kanban-list-column', listId };
}

export function payloadData(payload: { readonly data: Record<string, unknown> }): Record<string, unknown> {
  return payload.data;
}

export function readPdnd(data: Record<string, unknown>): string | undefined {
  const v = data.pdnd;
  return typeof v === 'string' ? v : undefined;
}

/**
 * Bubble-ordered drop targets list the innermost target first. The list body wraps all cards,
 * so gaps/padding can make [0] flip between card hitbox and list body. Prefer an explicit
 * card edge target whenever it appears anywhere in the chain.
 */
export function pickKanbanCardDropTargetData(
  dropTargets: readonly { readonly data: Record<string | symbol, unknown> }[],
): Record<string, unknown> | null {
  const asRecord = (d: Record<string | symbol, unknown>): Record<string, unknown> =>
    d as Record<string, unknown>;

  for (const t of dropTargets) {
    const rec = asRecord(t.data);
    if (readPdnd(rec) === PDND_KANBAN_CARD) {
      return rec;
    }
  }
  for (const t of dropTargets) {
    const rec = asRecord(t.data);
    if (readPdnd(rec) === PDND_KANBAN_LIST_BODY) {
      return rec;
    }
  }
  return null;
}
