/**
 * Home page pointer hit tests (Kanban-style: `elementsFromPoint`, skip float preview layer).
 */

const ATTR_PREVIEW = '[data-home-drag-preview="1"]';

function isUnderHomeDragPreview(el: Element): boolean {
  return el.closest(ATTR_PREVIEW) != null;
}

function walkElementsFromPoint(clientX: number, clientY: number): Element[] {
  const stack = document.elementsFromPoint(clientX, clientY);
  return stack.filter((el): el is Element => el instanceof Element);
}

/**
 * Closest `[data-home-workspace-row]` under the pointer (ignores home drag preview subtree).
 */
export function pickHomeWorkspaceRowUnderPointer(clientX: number, clientY: number): HTMLElement | null {
  for (const el of walkElementsFromPoint(clientX, clientY)) {
    if (isUnderHomeDragPreview(el)) {
      continue;
    }
    const row = el.closest('[data-home-workspace-row]');
    if (row instanceof HTMLElement) {
      return row;
    }
  }
  return null;
}

/**
 * Workspace id from `[data-home-board-grid]` or row under pointer.
 */
export function pickHomeTargetWorkspaceIdUnderPointer(clientX: number, clientY: number): string | null {
  for (const el of walkElementsFromPoint(clientX, clientY)) {
    if (isUnderHomeDragPreview(el)) {
      continue;
    }
    const grid = el.closest('[data-home-board-grid]');
    if (grid instanceof HTMLElement) {
      const id = grid.getAttribute('data-home-workspace-id');
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
    const row = el.closest('[data-home-workspace-row]');
    if (row instanceof HTMLElement) {
      const id = row.getAttribute('data-home-workspace-id');
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }
  return null;
}

export interface HomeBoardTileRect {
  readonly boardId: string;
  readonly rect: DOMRectReadOnly;
}

function collectBoardTilesInGrid(grid: HTMLElement, excludeBoardId?: string): HomeBoardTileRect[] {
  const nodes = grid.querySelectorAll<HTMLElement>('[data-home-board-id]');
  const out: HomeBoardTileRect[] = [];
  for (const node of nodes) {
    const id = node.getAttribute('data-home-board-id');
    if (typeof id !== 'string' || id === '' || id === excludeBoardId) {
      continue;
    }
    out.push({ boardId: id, rect: node.getBoundingClientRect() });
  }
  out.sort((a, b) => {
    const dy = a.rect.top - b.rect.top;
    if (Math.abs(dy) > 8) {
      return dy;
    }
    return a.rect.left - b.rect.left;
  });
  return out;
}

/**
 * Resolve insert-before anchor for a board drop. `null` = append to workspace row / empty grid.
 */
export function pickHomeBoardInsertAnchor(
  grid: HTMLElement,
  clientX: number,
  clientY: number,
  activeBoardId: string,
): { readonly anchorBoardId: string | null; readonly dropOnEmptyGrid: boolean } {
  const tiles = collectBoardTilesInGrid(grid, activeBoardId);
  if (tiles.length === 0) {
    return { anchorBoardId: null, dropOnEmptyGrid: true };
  }

  for (let i = 0; i < tiles.length; i += 1) {
    const { boardId, rect } = tiles[i]!;
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside) {
      const before = clientX < rect.left + rect.width / 2;
      if (before) {
        return { anchorBoardId: boardId, dropOnEmptyGrid: false };
      }
      const next = tiles[i + 1];
      return { anchorBoardId: next?.boardId ?? null, dropOnEmptyGrid: false };
    }
  }

  let best = tiles[0]!;
  let bestD = Infinity;
  for (const t of tiles) {
    const cx = t.rect.left + t.rect.width / 2;
    const cy = t.rect.top + t.rect.height / 2;
    const d = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  const idx = tiles.findIndex((t) => t.boardId === best.boardId);
  if (clientY < best.rect.top) {
    return { anchorBoardId: best.boardId, dropOnEmptyGrid: false };
  }
  if (clientY > best.rect.bottom) {
    return { anchorBoardId: tiles[idx + 1]?.boardId ?? null, dropOnEmptyGrid: false };
  }
  const midX = best.rect.left + best.rect.width / 2;
  if (clientX < midX) {
    return { anchorBoardId: best.boardId, dropOnEmptyGrid: false };
  }
  return { anchorBoardId: tiles[idx + 1]?.boardId ?? null, dropOnEmptyGrid: false };
}

export function findHomeBoardGridForWorkspace(
  listRoot: HTMLElement,
  workspaceId: string,
): HTMLElement | null {
  const escaped = CSS.escape(workspaceId);
  return listRoot.querySelector<HTMLElement>(
    `[data-home-board-grid][data-home-workspace-id="${escaped}"]`,
  );
}

/**
 * Insert index `0..n` for workspace row reorder (`n` = after last row). Rows ordered by DOM in `listRoot`.
 */
/**
 * Map insert index among rows **excluding** the dragged workspace to a "line before" index in the full ordered id list.
 */
export function fullWorkspaceInsertBeforeIndex(
  orderedIds: readonly string[],
  draggingWorkspaceId: string,
  filteredInsert: number,
): number {
  let fi = 0;
  for (let full = 0; full < orderedIds.length; full += 1) {
    const id = orderedIds[full]!;
    if (id === draggingWorkspaceId) {
      continue;
    }
    if (fi === filteredInsert) {
      return full;
    }
    fi += 1;
  }
  return orderedIds.length;
}

export function pickHomeWorkspaceRowInsertIndex(
  listRoot: HTMLElement,
  clientY: number,
  draggingWorkspaceId: string,
): number {
  const rows = [...listRoot.querySelectorAll<HTMLElement>('[data-home-workspace-row]')].filter(
    (r) => r.getAttribute('data-home-workspace-id') !== draggingWorkspaceId,
  );
  if (rows.length === 0) {
    return 0;
  }
  let insert = rows.length;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) {
      insert = i;
      break;
    }
  }
  return insert;
}
