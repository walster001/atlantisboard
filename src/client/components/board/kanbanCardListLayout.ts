/**
 * Shared kanban column card-list max viewport height (one resize subscription per board in KanbanView).
 * Short lists use actual content height; Virtuoso caps at this value only when content overflows.
 */
export function getKanbanCardListMaxBodyPx(canAddCard = true): number {
  if (typeof globalThis.window === 'undefined') {
    return 520;
  }
  const vh = globalThis.window.innerHeight;
  const boardHeaderPx = 56;
  const viewportGapsPx = Math.round(vh * 0.05);
  /** List title row, column padding, optional “+ Add a card” strip (~40px less when absent). */
  const listHeaderPaddingChromePx = canAddCard ? 112 : 72;
  return Math.max(160, Math.floor(vh - boardHeaderPx - viewportGapsPx - listHeaderPaddingChromePx));
}
