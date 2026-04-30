/**
 * Trello-style fractional ordering for board lists.
 * Mirrors card `pos` behavior so list reorders are local writes.
 */
export const LIST_POS_STEP = 1000;

/** Reject averages when neighbours are too close (precision / collision). */
export const LIST_POS_MIN_GAP = 1e-6;

export function spreadListPosForIndex(index: number): number {
  return (index + 1) * LIST_POS_STEP;
}

/** Insert `pos` between two neighbours; null means open end (start / end of board). */
export function insertListPosBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) {
    return LIST_POS_STEP;
  }
  if (before == null && after != null) {
    return after / 2;
  }
  if (before != null && after == null) {
    return before + LIST_POS_STEP;
  }
  if (before != null && after != null) {
    return (before + after) / 2;
  }
  return LIST_POS_STEP;
}

export function listPosGapTooSmall(before: number | null, after: number | null): boolean {
  if (before == null || after == null) {
    return false;
  }
  return after - before < LIST_POS_MIN_GAP;
}

export function listPosNeedsNormalize(sortedPos: readonly number[]): boolean {
  for (let i = 1; i < sortedPos.length; i += 1) {
    const prev = sortedPos[i - 1];
    const cur = sortedPos[i];
    if (prev == null || cur == null) {
      return true;
    }
    if (cur <= prev) {
      return true;
    }
    if (cur - prev < LIST_POS_MIN_GAP) {
      return true;
    }
  }
  return false;
}

/** Client + server: order lists primarily by `pos`, then legacy `position`, then id. */
export function compareBoardListOrder(
  a: { readonly pos?: number; readonly position: number; readonly id: string },
  b: { readonly pos?: number; readonly position: number; readonly id: string },
): number {
  const ap =
    typeof a.pos === 'number' && Number.isFinite(a.pos) ? a.pos : spreadListPosForIndex(a.position);
  const bp =
    typeof b.pos === 'number' && Number.isFinite(b.pos) ? b.pos : spreadListPosForIndex(b.position);
  if (ap !== bp) {
    return ap - bp;
  }
  return a.id.localeCompare(b.id);
}
