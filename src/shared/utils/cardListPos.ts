/**
 * Trello-style fractional ordering within a list: `pos` is a number; new cards are spaced,
 * moves use the average of neighbours, and the server occasionally re-spreads a whole list.
 */

export const CARD_POS_STEP = 1000;

/** Reject averages when neighbours are too close (precision / collision). */
export const CARD_POS_MIN_GAP = 1e-6;

export function spreadPosForIndex(index: number): number {
  return (index + 1) * CARD_POS_STEP;
}

/** Insert `pos` between two neighbours; null means open end (start / end of list). */
export function insertPosBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) {
    return CARD_POS_STEP;
  }
  if (before == null && after != null) {
    return after / 2;
  }
  if (before != null && after == null) {
    return before + CARD_POS_STEP;
  }
  if (before != null && after != null) {
    return (before + after) / 2;
  }
  return CARD_POS_STEP;
}

export function posGapTooSmall(before: number | null, after: number | null): boolean {
  if (before == null || after == null) {
    return false;
  }
  return after - before < CARD_POS_MIN_GAP;
}

export function posNeedsNormalize(sortedPos: readonly number[]): boolean {
  for (let i = 1; i < sortedPos.length; i += 1) {
    const prev = sortedPos[i - 1];
    const cur = sortedPos[i];
    if (prev == null || cur == null) {
      return true;
    }
    if (cur <= prev) {
      return true;
    }
    if (cur - prev < CARD_POS_MIN_GAP) {
      return true;
    }
  }
  return false;
}

/** Client + server: order cards primarily by `pos`, then legacy `position`, then id. */
export function compareCardListOrder(
  a: { readonly pos?: number; readonly position: number; readonly id: string },
  b: { readonly pos?: number; readonly position: number; readonly id: string },
): number {
  const ap =
    typeof a.pos === 'number' && Number.isFinite(a.pos) ? a.pos : (a.position + 1) * CARD_POS_STEP;
  const bp =
    typeof b.pos === 'number' && Number.isFinite(b.pos) ? b.pos : (b.position + 1) * CARD_POS_STEP;
  if (ap !== bp) {
    return ap - bp;
  }
  return a.id.localeCompare(b.id);
}
