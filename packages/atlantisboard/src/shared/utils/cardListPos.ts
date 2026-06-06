import { createFractionalPos } from './fractionalPos.js';

const cardPos = createFractionalPos(1000, 1e-6);

export const CARD_POS_STEP = cardPos.STEP;
export const CARD_POS_MIN_GAP = cardPos.MIN_GAP;

export function spreadPosForIndex(index: number): number {
  return cardPos.spreadForIndex(index);
}

export function insertPosBetween(before: number | null, after: number | null): number {
  return cardPos.insertBetween(before, after);
}

export function posGapTooSmall(before: number | null, after: number | null): boolean {
  return cardPos.gapTooSmall(before, after);
}

export function posNeedsNormalize(sortedPos: readonly number[]): boolean {
  return cardPos.needsNormalize(sortedPos);
}

export function compareCardListOrder(
  a: { readonly pos?: number; readonly position: number; readonly id: string },
  b: { readonly pos?: number; readonly position: number; readonly id: string },
): number {
  return cardPos.compareOrder(a, b);
}
