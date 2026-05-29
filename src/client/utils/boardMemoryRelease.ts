import { clearCardDetailWarmCacheForBoard } from '../hooks/useCardDetailLoader.js';
import { clearAttachmentStreamCache } from './attachmentStreamUrlClient.js';
import { purgeDexieBoardCards } from '../store/boardDexieCache.js';

/**
 * Release client-side caches tied to a board when navigating away (warm card cache,
 * attachment URL timers, Dexie card snapshots for that board).
 */
export function releaseBoardClientResources(boardId: string): void {
  const bid = boardId.trim();
  if (bid === '') {
    return;
  }
  clearCardDetailWarmCacheForBoard(bid);
  clearAttachmentStreamCache();
  void purgeDexieBoardCards(bid);
}
