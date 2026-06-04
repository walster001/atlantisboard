import type { CardDB } from '../../store/database.js';
import { extractMongoStringId } from '../../../shared/mongoId.js';
import { transformCard } from './transformCard.js';

/**
 * True when the API payload includes card-detail fields (vs list/kanban summaries).
 * Summaries omit `comments`, `attachments`, `checklists`, `reminders`, and `description`.
 */
export function isCardDetailPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const r = raw as Record<string, unknown>;
  return (
    'comments' in r ||
    'attachments' in r ||
    'checklists' in r ||
    'reminders' in r ||
    'description' in r
  );
}

/**
 * Kanban/list summaries overwrite Dexie via `bulkPut` with sparse rows. Merge preserves
 * detail fields already loaded until a full detail payload arrives.
 */
function preserveCardPlacementFields(existing: CardDB, incoming: CardDB): CardDB {
  if (incoming.listId.trim() === '' && existing.listId.trim() !== '') {
    return { ...incoming, listId: existing.listId };
  }
  if (incoming.boardId.trim() === '' && existing.boardId.trim() !== '') {
    return { ...incoming, boardId: existing.boardId };
  }
  return incoming;
}

export function mergeDexieCardIfSnapshot(
  raw: unknown,
  existing: CardDB | undefined,
  incoming: CardDB,
): CardDB {
  if (existing == null || isCardDetailPayload(raw)) {
    return existing != null ? preserveCardPlacementFields(existing, incoming) : incoming;
  }
  return {
    ...existing,
    ...incoming,
    ...(existing.description !== undefined ? { description: existing.description } : {}),
    ...(existing.descriptionHtml !== undefined ? { descriptionHtml: existing.descriptionHtml } : {}),
    comments: existing.comments,
    checklists: existing.checklists,
    attachments: existing.attachments,
    reminders: existing.reminders,
  };
}

/** Preserves kanban placement when API/socket payloads omit or corrupt list/board ids. */
export interface CardPlacementFallback {
  readonly listId?: string;
  readonly boardId?: string;
  readonly position?: number;
  readonly pos?: number;
}

/** Normalize GET /cards/:id (and similar) responses for UI + Dexie. */
export function normalizeCardFromApi(
  raw: unknown,
  fallbackId?: string,
  placementFallback?: CardPlacementFallback,
): CardDB {
  const cardData = transformCard(raw);
  const resolvedId =
    extractMongoStringId(cardData.id) ||
    extractMongoStringId((raw as { _id?: unknown } | null)?._id) ||
    (fallbackId?.trim() ?? '');
  if (!resolvedId) {
    throw new Error('Card response missing id');
  }
  const listId =
    cardData.listId.trim() !== ''
      ? cardData.listId
      : (placementFallback?.listId?.trim() ?? '');
  const boardId =
    cardData.boardId.trim() !== ''
      ? cardData.boardId
      : (placementFallback?.boardId?.trim() ?? '');
  const position =
    typeof placementFallback?.position === 'number' && !Number.isNaN(placementFallback.position)
      ? placementFallback.position
      : cardData.position;
  const pos =
    typeof placementFallback?.pos === 'number' && Number.isFinite(placementFallback.pos)
      ? placementFallback.pos
      : cardData.pos;
  return {
    ...cardData,
    id: resolvedId,
    listId,
    boardId,
    position,
    ...(pos !== undefined ? { pos } : {}),
  };
}
