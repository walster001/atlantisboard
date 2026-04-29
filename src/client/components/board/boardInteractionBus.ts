import type { MutableRefObject } from 'react';
import { useBoardInteractionStore } from './boardInteractionStore.js';

interface InteractionRouteContext {
  readonly root: HTMLElement;
  readonly suppressCardOpenClickRef?: MutableRefObject<boolean>;
}

function findCardMenuTrigger(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>('[data-kanban-card-menu-trigger="1"]');
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
  context.suppressCardOpenClickRef?.current && (context.suppressCardOpenClickRef.current = true);
  const rect = trigger.getBoundingClientRect();
  useBoardInteractionStore.getState().openCardMenu({ cardId, listId, anchorRect: rect });
  event.stopPropagation();
}
