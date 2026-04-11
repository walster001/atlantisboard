import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import { arrayMove } from '../../dnd/pragmatic/arrayMove.js';

/** Safe workspace id for comparisons (handles non-string payloads from older cache/socket edge cases). */
export function boardWorkspaceKey(b: Pick<BoardDB, 'workspaceId'>): string {
  const w = b.workspaceId;
  if (w == null || w === '') {
    return '';
  }
  return typeof w === 'string' ? w.trim() : String(w).trim();
}

export function boardIdKey(id: string): string {
  return String(id).trim();
}

/**
 * One row per board id (last occurrence wins). Duplicate `id` rows break cross-workspace merges
 * (`Map` + `byId`) and can make one drag update the wrong duplicate.
 */
export function dedupeBoardsLastWinsById(boards: readonly BoardDB[]): BoardDB[] {
  const seen = new Set<string>();
  const out: BoardDB[] = [];
  for (let i = boards.length - 1; i >= 0; i -= 1) {
    const b = boards[i]!;
    const k = boardIdKey(b.id);
    if (k === '' || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(b);
  }
  return out.reverse();
}

/**
 * Apply saved home workspace order: known ids first, then remaining workspaces by `createdAt` desc.
 */
export function mergeWorkspacesWithHomeOrder(
  workspaces: readonly WorkspaceDB[],
  order: readonly string[] | undefined,
): WorkspaceDB[] {
  if (order == null || order.length === 0) {
    return [...workspaces].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const byId = new Map(workspaces.map((w) => [w.id, w] as const));
  const seen = new Set<string>();
  const out: WorkspaceDB[] = [];
  for (const id of order) {
    const w = byId.get(id);
    if (w != null && !seen.has(id)) {
      out.push(w);
      seen.add(id);
    }
  }
  const rest = workspaces
    .filter((w) => !seen.has(w.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return [...out, ...rest];
}

export function getBoardsInWorkspaceSorted(allBoards: BoardDB[], workspaceId: string): BoardDB[] {
  const wid = workspaceId.trim();
  const list = allBoards.filter((b) => boardWorkspaceKey(b) === wid);
  return [...list].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function sortBoardsFlatHome(prev: BoardDB[]): BoardDB[] {
  return [...prev].sort((a, b) => {
    const wa = boardWorkspaceKey(a);
    const wb = boardWorkspaceKey(b);
    if (wa !== wb) {
      return wa.localeCompare(wb);
    }
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Apply one `boards:positionsSynced` payload to the in-memory home list.
 *
 * Only updates **position** for boards the client already attributes to `workspaceId`.
 * Never assigns `workspaceId` from this event: cross-workspace membership is applied via
 * `board:updated` / API. Otherwise a stale or duplicate `positionsSynced` for workspace A
 * (still listing a board that moved to B) would yank that board back to A and break later drags.
 */
export function mergeHomePositionsSyncIntoBoards(
  prev: readonly BoardDB[],
  workspaceId: string,
  orderedBoardIds: readonly string[],
): { readonly next: BoardDB[]; readonly touched: boolean } {
  const wid = workspaceId.trim();
  const posById = new Map(orderedBoardIds.map((id, i) => [boardIdKey(String(id)), i]));
  const inReorder = new Set(orderedBoardIds.map((id) => boardIdKey(String(id))));
  let touched = false;
  const next = prev.map((b) => {
    const bid = boardIdKey(b.id);
    if (!inReorder.has(bid)) {
      return b;
    }
    const p = posById.get(bid);
    if (p === undefined) {
      return b;
    }
    const curWs = boardWorkspaceKey(b);
    if (curWs !== wid) {
      return b;
    }
    if (b.position === p) {
      return b;
    }
    touched = true;
    return { ...b, position: p };
  });
  if (!touched) {
    return { next: prev as BoardDB[], touched: false };
  }
  return { next: sortBoardsFlatHome(next), touched: true };
}

export function resolveDropTargetWorkspaceIdForHome(
  overId: string,
  workspaces: WorkspaceDB[],
  boards: BoardDB[],
): string | undefined {
  if (workspaces.some((w) => w.id === overId)) {
    return overId;
  }
  const overBoard = boards.find((b) => b.id === overId);
  if (overBoard?.workspaceId) {
    return overBoard.workspaceId;
  }
  return undefined;
}

export function moveBoardToHoverSlot(
  scopeList: BoardDB[],
  activeBoardId: string,
  overBoardId: string,
): BoardDB[] | null {
  const ak = boardIdKey(activeBoardId);
  const ok = boardIdKey(overBoardId);
  if (ak === ok) {
    return null;
  }
  const ordered = [...scopeList].sort((a, b) => a.position - b.position);
  const fromIdx = ordered.findIndex((b) => boardIdKey(b.id) === ak);
  const overIdx = ordered.findIndex((b) => boardIdKey(b.id) === ok);
  if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) {
    return null;
  }
  const next = [...ordered];
  const [active] = next.splice(fromIdx, 1);
  if (active == null) {
    return null;
  }
  /** After removal, indices at/after `fromIdx` shift down by 1 — keep insert-before-`over` semantics. */
  const insertAt = fromIdx < overIdx ? overIdx - 1 : overIdx;
  next.splice(insertAt, 0, active);
  return next.map((b, i) => ({ ...b, position: i }));
}

function moveBoardToEndOfScope(scopeList: BoardDB[], activeBoardId: string): BoardDB[] | null {
  const ak = boardIdKey(activeBoardId);
  const ordered = [...scopeList].sort((a, b) => a.position - b.position);
  const fromIdx = ordered.findIndex((b) => boardIdKey(b.id) === ak);
  if (fromIdx < 0) {
    return null;
  }
  const next = [...ordered];
  const [active] = next.splice(fromIdx, 1);
  if (active == null) {
    return null;
  }
  next.push(active);
  return next.map((b, i) => ({ ...b, position: i }));
}

function sortBoardsByPositionThenCreated(a: BoardDB, b: BoardDB): number {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * Single source of truth: remove the dragged board from its row, then insert into the target row.
 * Rebuilds the flat list from workspace partitions so duplicate `id` rows cannot survive the move.
 */
export function moveHomeBoardOptimistic(
  allBoards: BoardDB[],
  activeId: string,
  targetWorkspaceId: string,
  anchorBoardId: string | null,
): BoardDB[] | null {
  const boards = dedupeBoardsLastWinsById(allBoards);
  const targetW = targetWorkspaceId.trim();
  const aid = boardIdKey(activeId);
  const dragged = boards.find((b) => boardIdKey(b.id) === aid);
  if (dragged == null) {
    return null;
  }
  const sourceWs = boardWorkspaceKey(dragged);
  if (sourceWs === '') {
    return null;
  }

  if (sourceWs === targetW) {
    const other = boards.filter((b) => boardWorkspaceKey(b) !== sourceWs);
    const scopeList = getBoardsInWorkspaceSorted(boards, sourceWs);
    const reordered =
      anchorBoardId == null
        ? moveBoardToEndOfScope(scopeList, activeId)
        : moveBoardToHoverSlot(scopeList, activeId, anchorBoardId);
    if (reordered == null) {
      return null;
    }
    const renumbered = reordered.map((b, i) => ({
      ...b,
      position: i,
      workspaceId: sourceWs,
    }));
    return sortBoardsFlatHome([...other, ...renumbered]);
  }

  const other = boards.filter((b) => {
    const w = boardWorkspaceKey(b);
    return w !== sourceWs && w !== targetW;
  });

  const sourceOnly = boards
    .filter((b) => boardWorkspaceKey(b) === sourceWs && boardIdKey(b.id) !== aid)
    .sort(sortBoardsByPositionThenCreated);

  const targetOnly = boards
    .filter((b) => boardWorkspaceKey(b) === targetW && boardIdKey(b.id) !== aid)
    .sort(sortBoardsByPositionThenCreated);

  const moved: BoardDB = { ...dragged, workspaceId: targetW };
  const overIdx =
    anchorBoardId == null
      ? targetOnly.length
      : targetOnly.findIndex((b) => boardIdKey(b.id) === boardIdKey(anchorBoardId));
  if (overIdx < 0) {
    return null;
  }

  const newTarget = [...targetOnly.slice(0, overIdx), moved, ...targetOnly.slice(overIdx)].map(
    (b, i) => ({
      ...b,
      position: i,
      workspaceId: targetW,
    }),
  );

  const newSource = sourceOnly.map((b, i) => ({
    ...b,
    position: i,
    workspaceId: sourceWs,
  }));

  return sortBoardsFlatHome([...other, ...newSource, ...newTarget]);
}

/**
 * Build `orderedBoardIds` for PUT /boards/reorder using **server-canonical** id strings so the set
 * matches `listBoardsInHomeScopeForReorder` even when the client used a different string form.
 */
export function mergeClientOrderWithServerScope(
  workspaceId: string,
  clientOrderedIds: readonly string[],
  serverBoards: BoardDB[],
): string[] {
  const scope = getBoardsInWorkspaceSorted(serverBoards, workspaceId);
  const keyToCanonical = new Map<string, string>();
  for (const b of scope) {
    keyToCanonical.set(boardIdKey(b.id), b.id);
  }
  const serverKeys = new Set(scope.map((b) => boardIdKey(b.id)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of clientOrderedIds) {
    const k = boardIdKey(String(id));
    if (serverKeys.has(k) && !seen.has(k)) {
      seen.add(k);
      const canonical = keyToCanonical.get(k);
      if (canonical !== undefined) {
        out.push(canonical);
      }
    }
  }
  for (const b of scope) {
    const k = boardIdKey(b.id);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(b.id);
    }
  }
  return out;
}

export function boardsAfterCrossWorkspaceAppend(
  boards: BoardDB[],
  boardId: string,
  targetWorkspaceId: string,
): BoardDB[] {
  const list = dedupeBoardsLastWinsById(boards);
  const bid = boardIdKey(boardId);
  const tw = targetWorkspaceId.trim();
  const dragged = list.find((b) => boardIdKey(b.id) === bid);
  if (dragged == null) {
    return list;
  }
  const sourceWs = boardWorkspaceKey(dragged);
  if (sourceWs === '') {
    return list;
  }
  const other = list.filter((b) => {
    const w = boardWorkspaceKey(b);
    return w !== sourceWs && w !== tw;
  });
  const sourceOnly = list
    .filter((b) => boardWorkspaceKey(b) === sourceWs && boardIdKey(b.id) !== bid)
    .sort(sortBoardsByPositionThenCreated);
  const targetOnly = list
    .filter((b) => boardWorkspaceKey(b) === tw && boardIdKey(b.id) !== bid)
    .sort(sortBoardsByPositionThenCreated);
  const moved: BoardDB = { ...dragged, workspaceId: tw };
  const newTarget = [...targetOnly, moved].map((b, i) => ({
    ...b,
    position: i,
    workspaceId: tw,
  }));
  const newSource = sourceOnly.map((b, i) => ({
    ...b,
    position: i,
    workspaceId: sourceWs,
  }));
  return sortBoardsFlatHome([...other, ...newSource, ...newTarget]);
}

export function applyHomeWorkspaceGridDropLayout(
  boards: BoardDB[],
  activeId: string,
  targetWorkspaceId: string,
): BoardDB[] | null {
  const list = dedupeBoardsLastWinsById(boards);
  const aid = boardIdKey(activeId);
  const dragged = list.find((b) => boardIdKey(b.id) === aid);
  if (dragged == null) {
    return null;
  }
  const sourceWs = boardWorkspaceKey(dragged);
  const w = targetWorkspaceId.trim();
  if (sourceWs === '' || w === sourceWs) {
    return null;
  }
  const other = list.filter((b) => {
    const bw = boardWorkspaceKey(b);
    return bw !== sourceWs && bw !== w;
  });
  const sourceOnly = list
    .filter((b) => boardWorkspaceKey(b) === sourceWs && boardIdKey(b.id) !== aid)
    .sort(sortBoardsByPositionThenCreated);
  const targetOnly = list
    .filter((b) => boardWorkspaceKey(b) === w && boardIdKey(b.id) !== aid)
    .sort(sortBoardsByPositionThenCreated);
  const moved: BoardDB = { ...dragged, workspaceId: w };
  const newTarget = [...targetOnly, moved].map((b, i) => ({
    ...b,
    position: i,
    workspaceId: w,
  }));
  const newSource = sourceOnly.map((b, i) => ({
    ...b,
    position: i,
    workspaceId: sourceWs,
  }));
  return sortBoardsFlatHome([...other, ...newSource, ...newTarget]);
}

export { arrayMove };
