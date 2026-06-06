import type { CardDB } from '../store/database.js';

const MAX_CARD_DEDUPE_ENTRIES = 512;

/** Last normalized JSON per card — suppresses redundant Dexie + bridge work (e.g. service emit + change stream). */
const lastCardNormalizedJsonById = new Map<string, string>();

/**
 * Returns true if this normalized card is identical to the last socket-applied payload for this id.
 * Call after `normalizeCardFromApi` and before Dexie put / `emitSocketCardUpdated`.
 */
export function isRedundantCardSocketPayload(cardId: string, normalized: CardDB): boolean {
  let json: string;
  try {
    json = JSON.stringify(normalized);
  } catch {
    return false;
  }
  const prev = lastCardNormalizedJsonById.get(cardId);
  if (prev === json) {
    return true;
  }
  lastCardNormalizedJsonById.set(cardId, json);
  while (lastCardNormalizedJsonById.size > MAX_CARD_DEDUPE_ENTRIES) {
    const first = lastCardNormalizedJsonById.keys().next().value;
    if (first === undefined) {
      break;
    }
    lastCardNormalizedJsonById.delete(first);
  }
  return false;
}

export function forgetCardSocketDedupe(cardId: string): void {
  lastCardNormalizedJsonById.delete(cardId);
}

export function clearCardSocketDedupeCache(): void {
  lastCardNormalizedJsonById.clear();
}
