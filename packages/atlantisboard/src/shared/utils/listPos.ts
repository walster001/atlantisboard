import { createFractionalPos } from './fractionalPos.js';

const listPos = createFractionalPos(1000, 1e-6);

export const LIST_POS_STEP = listPos.STEP;
export const LIST_POS_MIN_GAP = listPos.MIN_GAP;

export function spreadListPosForIndex(index: number): number {
  return listPos.spreadForIndex(index);
}

export function insertListPosBetween(before: number | null, after: number | null): number {
  return listPos.insertBetween(before, after);
}

export function listPosGapTooSmall(before: number | null, after: number | null): boolean {
  return listPos.gapTooSmall(before, after);
}

export function listPosNeedsNormalize(sortedPos: readonly number[]): boolean {
  return listPos.needsNormalize(sortedPos);
}

export function compareBoardListOrder(
  a: { readonly pos?: number; readonly position: number; readonly id: string },
  b: { readonly pos?: number; readonly position: number; readonly id: string },
): number {
  return listPos.compareOrder(a, b);
}
