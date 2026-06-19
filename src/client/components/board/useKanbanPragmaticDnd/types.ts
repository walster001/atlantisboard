import type { MutableRefObject } from 'react';
import type { CardDB, ListDB } from '../../../store/database.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';

export interface ListDropIndicatorTarget {
  readonly overListId: string;
}

export interface KanbanPragmaticCtx {
  readonly board: { id: string };
  readonly lists: ListDB[];
  readonly cards: Map<string, CardDB[]>;
  readonly cardIdToListIdRef: MutableRefObject<Map<string, string>>;
  readonly setLists: React.Dispatch<React.SetStateAction<ListDB[]>>;
  readonly setCards: React.Dispatch<React.SetStateAction<Map<string, CardDB[]>>>;
  readonly reloadAllCardsFromDb: () => Promise<void>;
  readonly queueCardDropIndicator: (next: CardDropIndicatorTarget | null) => void;
  readonly flushCardDropIndicatorNow: (next: CardDropIndicatorTarget | null) => void;
  readonly cardDropIndicatorRef: MutableRefObject<CardDropIndicatorTarget | null>;
  readonly viewAliveRef: MutableRefObject<boolean>;
}

export interface UseKanbanPragmaticDndArgs {
  readonly kanbanDropCtxRef: MutableRefObject<KanbanPragmaticCtx>;
  readonly setDraggingCardId: (id: string | null) => void;
  readonly setDraggingListId: (id: string | null) => void;
  readonly setListDropIndicatorIfChanged: (next: ListDropIndicatorTarget | null) => void;
  /** Mobile carousel: advance columns when dragging a card against the viewport edge. */
  readonly carouselEdgeBumpRef?: MutableRefObject<((clientX: number) => void) | null>;
}
