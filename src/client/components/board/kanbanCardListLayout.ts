/**
 * Shared kanban column card-list height math (one resize subscription per board in KanbanView).
 */
export function getKanbanCardListMaxBodyPx(): number {
  if (typeof globalThis.window === 'undefined') {
    return 520;
  }
  const vh = globalThis.window.innerHeight;
  const boardHeaderPx = 56;
  const viewportGapsPx = Math.round(vh * 0.05);
  const listHeaderAddAndPaddingPx = 112;
  return Math.max(160, Math.floor(vh - boardHeaderPx - viewportGapsPx - listHeaderAddAndPaddingPx));
}
