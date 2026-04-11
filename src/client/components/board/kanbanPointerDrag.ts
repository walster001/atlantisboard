/** Horizontal stickiness when reordering lists (matches KanbanView PDND behavior). */
export const KANBAN_LIST_COLUMN_HIT_BUFFER_PX = 18;

const ATTR_LIST_BODY = 'data-kanban-list-body';

/**
 * Resolves the list whose card drop zone is under the pointer (cards scroller or a card inside it).
 * Ignores elements marked with `data-kanban-drag-preview` (floating preview layer).
 */
export function pickKanbanListBodyIdUnderPointer(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) {
      continue;
    }
    if (el.closest('[data-kanban-drag-preview="1"]') != null) {
      continue;
    }
    const body = el.closest(`[${ATTR_LIST_BODY}]`);
    if (body instanceof HTMLElement) {
      const id = body.getAttribute(ATTR_LIST_BODY);
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }
  return null;
}

/**
 * Which list column (`.board-column[data-kanban-list-id]`) contains `clientX`, with sticky buffer
 * when moving between adjacent columns (same idea as former drop-target stickiness).
 */
export function pickKanbanListColumnIdAtClientX(
  columnsRoot: HTMLElement | null,
  clientX: number,
  sourceListId: string,
  prevOverListId: string | null,
): string | null {
  if (columnsRoot == null) {
    return null;
  }
  const cols = [...columnsRoot.querySelectorAll<HTMLElement>('.board-column[data-kanban-list-id]')];
  let candidate: string | null = null;
  for (const el of cols) {
    const id = el.getAttribute('data-kanban-list-id');
    if (id == null || id === '') {
      continue;
    }
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right) {
      candidate = id;
      break;
    }
  }
  if (candidate == null) {
    return null;
  }
  if (candidate === sourceListId) {
    return null;
  }
  let next = candidate;
  if (prevOverListId != null && prevOverListId !== candidate) {
    const prevEl = columnsRoot.querySelector<HTMLElement>(
      `.board-column[data-kanban-list-id="${CSS.escape(prevOverListId)}"]`,
    );
    if (prevEl != null) {
      const r = prevEl.getBoundingClientRect();
      const withinStickyZone =
        clientX >= r.left - KANBAN_LIST_COLUMN_HIT_BUFFER_PX &&
        clientX <= r.right + KANBAN_LIST_COLUMN_HIT_BUFFER_PX;
      if (withinStickyZone) {
        next = prevOverListId;
      }
    }
  }
  if (next === sourceListId) {
    return null;
  }
  return next;
}

/** Vertical scroller inside a column (native list or Virtuoso inner scroller). */
export function findColumnVerticalScroller(fromEl: Element | null): HTMLElement | null {
  let n: Element | null = fromEl;
  while (n != null) {
    if (n instanceof HTMLElement) {
      const y = getComputedStyle(n).overflowY;
      if ((y === 'auto' || y === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
        return n;
      }
    }
    n = n.parentElement;
  }
  return null;
}

export interface KanbanEdgeScrollOptions {
  readonly clientX: number;
  readonly clientY: number;
  readonly boardBody: HTMLElement | null;
}

const EDGE = 48;
const STEP = 10;

/**
 * Single-tick edge scroll for board horizontal body and column vertical scroller under the pointer.
 */
export function applyKanbanEdgeScroll(opts: KanbanEdgeScrollOptions): void {
  const { clientX, clientY, boardBody } = opts;
  if (boardBody != null) {
    const br = boardBody.getBoundingClientRect();
    if (clientX > br.right - EDGE) {
      boardBody.scrollLeft += STEP;
    } else if (clientX < br.left + EDGE) {
      boardBody.scrollLeft -= STEP;
    }
  }
  const stack = document.elementsFromPoint(clientX, clientY);
  let start: Element | null = null;
  for (const el of stack) {
    if (el instanceof Element && el.closest('[data-kanban-drag-preview="1"]') == null) {
      start = el;
      break;
    }
  }
  const scroller = findColumnVerticalScroller(start);
  if (scroller != null) {
    const sr = scroller.getBoundingClientRect();
    if (clientY > sr.bottom - EDGE) {
      scroller.scrollTop += STEP;
    } else if (clientY < sr.top + EDGE) {
      scroller.scrollTop -= STEP;
    }
  }
}
