export interface FractionalPosOrderingRow {
  readonly pos?: number;
  readonly position: number;
  readonly id: string;
}

export interface FractionalPosApi {
  readonly STEP: number;
  readonly MIN_GAP: number;
  readonly spreadForIndex: (index: number) => number;
  readonly insertBetween: (before: number | null, after: number | null) => number;
  readonly gapTooSmall: (before: number | null, after: number | null) => boolean;
  readonly needsNormalize: (sortedPos: readonly number[]) => boolean;
  readonly compareOrder: (a: FractionalPosOrderingRow, b: FractionalPosOrderingRow) => number;
}

export function createFractionalPos(step: number, minGap: number): FractionalPosApi {
  function spreadForIndex(index: number): number {
    return (index + 1) * step;
  }

  function insertBetween(before: number | null, after: number | null): number {
    if (before == null && after == null) {
      return step;
    }
    if (before == null && after != null) {
      return after / 2;
    }
    if (before != null && after == null) {
      return before + step;
    }
    if (before != null && after != null) {
      return (before + after) / 2;
    }
    return step;
  }

  function gapTooSmall(before: number | null, after: number | null): boolean {
    if (before == null || after == null) {
      return false;
    }
    return after - before < minGap;
  }

  function needsNormalize(sortedPos: readonly number[]): boolean {
    for (let i = 1; i < sortedPos.length; i += 1) {
      const prev = sortedPos[i - 1];
      const cur = sortedPos[i];
      if (prev == null || cur == null) {
        return true;
      }
      if (cur <= prev) {
        return true;
      }
      if (cur - prev < minGap) {
        return true;
      }
    }
    return false;
  }

  function compareOrder(a: FractionalPosOrderingRow, b: FractionalPosOrderingRow): number {
    const ap =
      typeof a.pos === 'number' && Number.isFinite(a.pos) ? a.pos : spreadForIndex(a.position);
    const bp =
      typeof b.pos === 'number' && Number.isFinite(b.pos) ? b.pos : spreadForIndex(b.position);
    if (ap !== bp) {
      return ap - bp;
    }
    return a.id.localeCompare(b.id);
  }

  return {
    STEP: step,
    MIN_GAP: minGap,
    spreadForIndex,
    insertBetween,
    gapTooSmall,
    needsNormalize,
    compareOrder,
  };
}
