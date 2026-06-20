import { describe, expect, it } from 'bun:test';
import {
  KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX,
  resetKanbanCardDragPointerTracking,
  sampleKanbanCardDragPointer,
} from '../src/client/components/board/kanbanMobileDragState.js';

describe('kanbanMobileDragState pointer sampling', () => {
  it('does not reveal the drop slot until movement exceeds the threshold', () => {
    resetKanbanCardDragPointerTracking();
    expect(sampleKanbanCardDragPointer(100, 100)).toBe(false);
    const almost = KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX - 1;
    expect(sampleKanbanCardDragPointer(100 + almost, 100)).toBe(false);
    expect(sampleKanbanCardDragPointer(100, 100 + almost)).toBe(false);
    expect(sampleKanbanCardDragPointer(100 + KANBAN_DRAG_SLOT_REVEAL_THRESHOLD_PX, 100)).toBe(true);
    expect(sampleKanbanCardDragPointer(120, 140)).toBe(true);
  });
});
