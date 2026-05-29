import type { BoardPermissionKey, KanbanBoardEditCaps } from './useBoardPermissions.js';

/**
 * Derives kanban UI capability flags from resolved board permission keys.
 * Gated on `permissionsLoaded` so chrome stays hidden until keys are known.
 */
export function buildKanbanBoardEditCaps(
  permissionsLoaded: boolean,
  permissions: readonly BoardPermissionKey[],
): KanbanBoardEditCaps {
  const set = new Set(permissions);
  const c = (k: BoardPermissionKey) => set.has(k);
  return {
    canAddList: permissionsLoaded && c('lists.create'),
    canListMenu:
      permissionsLoaded &&
      (c('lists.update') || c('lists.delete') || c('lists.duplicate')),
    canDuplicateList: permissionsLoaded && c('lists.duplicate'),
    canAddCard: permissionsLoaded && c('cards.create'),
    canCardKanbanMenu:
      permissionsLoaded &&
      (c('cards.update') || c('cards.delete') || c('cards.duplicate')),
    canDuplicateCard: permissionsLoaded && c('cards.duplicate'),
    canDragKanbanCards: permissionsLoaded && (c('cards.move') || c('cards.reorder')),
    canReorderLists: permissionsLoaded && c('lists.reorder'),
  };
}
