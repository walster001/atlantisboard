import type { StateCreator } from 'zustand';
import type { CardDB } from '../database.js';
import {
  insertCardIdByPosition,
  normalizeListCardPositions,
  rebuildCardIdsForList,
  removeCardIdFromList,
  spreadPosForIndex,
  type BoardRuntimeStore,
} from './types.js';

export const createBoardCardMapSlice: StateCreator<
  BoardRuntimeStore,
  [],
  [],
  Pick<
    BoardRuntimeStore,
    | 'upsertCard'
    | 'upsertCards'
    | 'removeCard'
    | 'applyCardsReorderedInList'
    | 'applyCardsBulkPositionPatch'
    | 'applyCardsBulkColor'
    | 'applyLabelsRemovedBulk'
    | 'applyKanbanCardsMapPartial'
    | 'patchCardsDescription'
  >
> = (set, get) => ({
  upsertCard: (card) => {
    if (get().activeBoardId !== card.boardId) {
      return;
    }
    set((s) => {
      const prev = s.cardsById[card.id];
      const resolvedCard =
        prev != null
          ? {
              ...card,
              ...(card.listId.trim() === '' && prev.listId.trim() !== '' ? { listId: prev.listId } : {}),
              ...(card.boardId.trim() === '' && prev.boardId.trim() !== '' ? { boardId: prev.boardId } : {}),
            }
          : card;
      const cardsById = { ...s.cardsById, [resolvedCard.id]: resolvedCard };
      const cardIdsByListId = { ...s.cardIdsByListId };
      if (prev != null && prev.listId !== resolvedCard.listId) {
        const fromIds = removeCardIdFromList(cardIdsByListId[prev.listId] ?? [], resolvedCard.id);
        cardIdsByListId[prev.listId] = fromIds;
        const toIds = insertCardIdByPosition(
          cardIdsByListId[resolvedCard.listId] ?? [],
          resolvedCard.id,
          resolvedCard.position,
        );
        cardIdsByListId[resolvedCard.listId] = toIds;
        normalizeListCardPositions(cardsById, prev.listId, fromIds);
        normalizeListCardPositions(cardsById, resolvedCard.listId, toIds);
      } else {
        const listId = resolvedCard.listId;
        const prevIds = cardIdsByListId[listId] ?? [];
        const currentIndex = prevIds.indexOf(resolvedCard.id);
        const nextIds =
          currentIndex >= 0
            ? [...prevIds]
            : insertCardIdByPosition(prevIds, resolvedCard.id, resolvedCard.position);
        cardIdsByListId[listId] = nextIds;
        normalizeListCardPositions(cardsById, listId, nextIds);
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  upsertCards: (cards) => {
    if (cards.length === 0) {
      return;
    }
    const activeBoardId = get().activeBoardId;
    if (activeBoardId == null) {
      return;
    }
    set((s) => {
      const cardsById: Record<string, CardDB> = { ...s.cardsById };
      const touchedListIds = new Set<string>();
      for (const card of cards) {
        if (card.boardId !== activeBoardId) {
          continue;
        }
        const prev = cardsById[card.id];
        cardsById[card.id] = card;
        touchedListIds.add(card.listId);
        if (prev != null) {
          touchedListIds.add(prev.listId);
        }
      }
      if (touchedListIds.size === 0) {
        return s;
      }
      const cardIdsByListId = { ...s.cardIdsByListId };
      for (const listId of touchedListIds) {
        cardIdsByListId[listId] = rebuildCardIdsForList(listId, cardsById);
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  removeCard: (cardId) => {
    set((s) => {
      const prev = s.cardsById[cardId];
      if (prev == null) {
        return s;
      }
      const { [cardId]: _r, ...rest } = s.cardsById;
      const nextListIds = removeCardIdFromList(s.cardIdsByListId[prev.listId] ?? [], cardId);
      const normalizedRest = { ...rest };
      normalizeListCardPositions(normalizedRest, prev.listId, nextListIds);
      const cardIdsByListId = {
        ...s.cardIdsByListId,
        [prev.listId]: nextListIds,
      };
      return { cardsById: normalizedRest, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyCardsReorderedInList: (listId, orderedCardIds, orderedPos) => {
    set((s) => {
      const prevOrdered = s.cardIdsByListId[listId] ?? [];
      const sameOrder =
        prevOrdered.length === orderedCardIds.length &&
        prevOrdered.every((id, i) => id === orderedCardIds[i]);
      if (sameOrder) {
        return s;
      }
      const cardsById = { ...s.cardsById };
      const hasServerPos =
        orderedPos != null &&
        orderedPos.length === orderedCardIds.length &&
        orderedPos.every((p) => typeof p === 'number' && Number.isFinite(p));
      for (let i = 0; i < orderedCardIds.length; i += 1) {
        const id = orderedCardIds[i];
        const row = cardsById[id];
        if (row != null && row.listId === listId) {
          const pos = hasServerPos ? orderedPos[i]! : spreadPosForIndex(i);
          cardsById[id] = { ...row, position: i, pos };
        }
      }
      const cardIdsByListId = {
        ...s.cardIdsByListId,
        [listId]: [...orderedCardIds],
      };
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyCardsBulkPositionPatch: (patches) => {
    if (patches.length === 0) {
      return;
    }
    set((s) => {
      const cardsById = { ...s.cardsById };
      const cardIdsByListId = { ...s.cardIdsByListId };
      let touched = false;
      for (const patch of patches) {
        const listId = patch.listId;
        const orderedIds = [...patch.orderedCardIds];
        const orderedPos = patch.orderedPos;
        const prev = cardIdsByListId[listId] ?? [];
        const sameOrder =
          prev.length === orderedIds.length && prev.every((id, i) => id === orderedIds[i]);
        if (sameOrder) {
          continue;
        }
        touched = true;
        cardIdsByListId[listId] = orderedIds;
        const hasServerPos =
          orderedPos != null &&
          orderedPos.length === orderedIds.length &&
          orderedPos.every((p) => typeof p === 'number' && Number.isFinite(p));
        for (let i = 0; i < orderedIds.length; i += 1) {
          const id = orderedIds[i];
          const row = cardsById[id];
          const pos = hasServerPos ? orderedPos[i]! : spreadPosForIndex(i);
          if (row != null && (row.listId !== listId || row.position !== i || row.pos !== pos)) {
            cardsById[id] = { ...row, listId, position: i, pos };
          }
        }
      }
      if (!touched) {
        return s;
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyCardsBulkColor: (listId, colorTrimmed) => {
    set((s) => {
      if (s.activeBoardId == null || s.board == null) {
        return s;
      }
      const bid = s.board.id;
      const cardsById = { ...s.cardsById };
      for (const id of Object.keys(cardsById)) {
        const row = cardsById[id];
        if (row == null || row.boardId !== bid) {
          continue;
        }
        if (listId != null && row.listId !== listId) {
          continue;
        }
        const { color: _c, ...withoutColor } = row;
        cardsById[id] =
          colorTrimmed === '' ? withoutColor : { ...row, color: colorTrimmed };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyLabelsRemovedBulk: (labelId, affectedCardIds) => {
    const rm = String(labelId);
    set((s) => {
      const cardsById = { ...s.cardsById };
      for (const cid of affectedCardIds) {
        const row = cardsById[cid];
        if (row == null) {
          continue;
        }
        const prevLabels = Array.isArray(row.labels) ? row.labels : [];
        cardsById[cid] = {
          ...row,
          labels: prevLabels.filter((l) => String(l.id) !== rm),
        };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },

  applyKanbanCardsMapPartial: (map) => {
    set((s) => {
      const cardsById = { ...s.cardsById };
      const cardIdsByListId = { ...s.cardIdsByListId };
      for (const [lid, arr] of map) {
        for (const id of cardIdsByListId[lid] ?? []) {
          delete cardsById[id];
        }
        cardIdsByListId[lid] = arr.map((c) => c.id);
        for (const c of arr) {
          cardsById[c.id] = c;
        }
      }
      return { cardsById, cardIdsByListId, cardsVersion: s.cardsVersion + 1 };
    });
  },

  patchCardsDescription: (patches) => {
    if (patches.length === 0) {
      return;
    }
    set((s) => {
      const cardsById = { ...s.cardsById };
      for (const p of patches) {
        const row = cardsById[p.id];
        if (row == null) {
          continue;
        }
        cardsById[p.id] = {
          ...row,
          description: p.description ?? row.description ?? '',
          ...(p.descriptionHtml !== undefined ? { descriptionHtml: p.descriptionHtml } : {}),
        };
      }
      return { cardsById, cardsVersion: s.cardsVersion + 1 };
    });
  },
});
