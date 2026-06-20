/** Pointer must move at least this far before drop-slot / source-hide chrome appears. */
export const KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX = 12;

/** Shared mobile/native card drag chrome — avoids hiding the source card before iOS preview paints. */
export const kanbanNativeCardDragActiveRef = { current: false };
export const kanbanCardDragPreviewReadyRef = { current: false };
export const kanbanCardDragSlotRevealedRef = { current: false };

let kanbanCardDragStartPointer: { readonly x: number; readonly y: number } | null = null;

export function resetKanbanCardDragPointerTracking(): void {
  kanbanCardDragSlotRevealedRef.current = false;
  kanbanCardDragStartPointer = null;
}

export function resetKanbanMobileDragChromeState(): void {
  kanbanNativeCardDragActiveRef.current = false;
  kanbanCardDragPreviewReadyRef.current = false;
  resetKanbanCardDragPointerTracking();
}

export function markKanbanCardDragStarted(): void {
  kanbanNativeCardDragActiveRef.current = true;
  kanbanCardDragPreviewReadyRef.current = false;
  resetKanbanCardDragPointerTracking();
}

export function markKanbanCardDragPreviewReady(): void {
  kanbanCardDragPreviewReadyRef.current = true;
}

/** True once pointer moved enough to reveal drop-slot chrome; until then treat as pending cancel. */
export function sampleKanbanCardDragPointer(clientX: number, clientY: number): boolean {
  if (kanbanCardDragSlotRevealedRef.current) return true;
  if (kanbanCardDragStartPointer == null) {
    kanbanCardDragStartPointer = { x: clientX, y: clientY };
    return false;
  }
  const dx = Math.abs(clientX - kanbanCardDragStartPointer.x);
  const dy = Math.abs(clientY - kanbanCardDragStartPointer.y);
  if (dx >= KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX || dy >= KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX) {
    kanbanCardDragSlotRevealedRef.current = true;
    return true;
  }
  return false;
}

/** Virtuoso treats 0px rows poorly on iOS WebKit — keep a 1px collapsed placeholder. */
export const KANBAN_DRAG_LAYOUT_COLLAPSED_HEIGHT_PX = 1;
