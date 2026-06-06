import type { MutableRefObject } from 'react';
import { useBoardInteractionStore } from './boardInteractionStore.js';

interface InteractionRouteContext {
  readonly root: HTMLElement;
  readonly suppressCardOpenClickRef?: MutableRefObject<boolean>;
}

function findCardMenuTrigger(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) {
    return null;
  }
  /** Icon dots are SVG; `click` target is often a path, not an `HTMLElement`. */
  const start = target instanceof Element ? target : target.parentElement;
  if (start == null) {
    return null;
  }
  return start.closest<HTMLElement>('[data-kanban-card-menu-trigger="1"]');
}

export function routeBoardClick(event: MouseEvent, context: InteractionRouteContext): void {
  const targetNode = event.target;
  if (targetNode instanceof Node && !context.root.contains(targetNode)) {
    return;
  }
  const trigger = findCardMenuTrigger(event.target);
  if (trigger == null) {
    useBoardInteractionStore.getState().closeCardMenu();
    return;
  }
  const cardId = trigger.dataset.kanbanCardId?.trim() ?? '';
  if (cardId === '') {
    return;
  }
  const cardRoot = trigger.closest<HTMLElement>('[data-kanban-card-id][data-kanban-list-id]');
  const listId = cardRoot?.dataset.kanbanListId?.trim() ?? '';
  if (listId === '') {
    return;
  }
  if (context.suppressCardOpenClickRef != null) {
    context.suppressCardOpenClickRef.current = true;
  }
  const rect = trigger.getBoundingClientRect();
  useBoardInteractionStore.getState().openCardMenu({ cardId, listId, anchorRect: rect });
  event.stopPropagation();
}
