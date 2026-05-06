import { useCallback, useRef, useState } from 'react';
import type { CardDropIndicatorTarget } from './VirtualizedCardList.js';

interface ListDropIndicatorTarget {
  readonly overListId: string;
}

/** Layout intent only — boxWidth/boxHeight are display hints and must not trigger re-renders every tick. */
function cardDropIndicatorsEqual(
  a: CardDropIndicatorTarget | null,
  b: CardDropIndicatorTarget | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return (
    a.listId === b.listId &&
    a.sourceListId === b.sourceListId &&
    a.anchorCardId === b.anchorCardId &&
    a.columnIntent === b.columnIntent
  );
}

function listDropIndicatorsEqual(
  a: ListDropIndicatorTarget | null,
  b: ListDropIndicatorTarget | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return a.overListId === b.overListId;
}

export function useKanbanDropIndicators() {
  const [cardDropIndicator, setCardDropIndicator] = useState<CardDropIndicatorTarget | null>(null);
  const cardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  const [listDropIndicator, setListDropIndicator] = useState<ListDropIndicatorTarget | null>(null);
  const listDropIndicatorRef = useRef<ListDropIndicatorTarget | null>(null);
  const pendingCardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  /** One rAF per frame batches pointermove; avoids double-rAF latency on drop hints. */
  const cardDropIndicatorRafRef = useRef<number | null>(null);

  const cancelPendingCardDropIndicatorRaf = useCallback((): void => {
    const id = cardDropIndicatorRafRef.current;
    if (id != null) {
      cancelAnimationFrame(id);
      cardDropIndicatorRafRef.current = null;
    }
  }, []);

  const setCardDropIndicatorIfChanged = useCallback((next: CardDropIndicatorTarget | null) => {
    if (cardDropIndicatorsEqual(cardDropIndicatorRef.current, next)) {
      return;
    }
    cardDropIndicatorRef.current = next;
    setCardDropIndicator(next);
  }, []);

  const setListDropIndicatorIfChanged = useCallback((next: ListDropIndicatorTarget | null) => {
    if (listDropIndicatorsEqual(listDropIndicatorRef.current, next)) {
      return;
    }
    listDropIndicatorRef.current = next;
    setListDropIndicator(next);
  }, []);

  const queueCardDropIndicator = useCallback(
    (next: CardDropIndicatorTarget | null) => {
      pendingCardDropIndicatorRef.current = next;
      if (cardDropIndicatorRafRef.current != null) {
        return;
      }
      cardDropIndicatorRafRef.current = requestAnimationFrame(() => {
        cardDropIndicatorRafRef.current = null;
        setCardDropIndicatorIfChanged(pendingCardDropIndicatorRef.current);
      });
    },
    [setCardDropIndicatorIfChanged],
  );

  const flushCardDropIndicatorNow = useCallback(
    (next: CardDropIndicatorTarget | null) => {
      cancelPendingCardDropIndicatorRaf();
      pendingCardDropIndicatorRef.current = next;
      setCardDropIndicatorIfChanged(next);
    },
    [cancelPendingCardDropIndicatorRaf, setCardDropIndicatorIfChanged],
  );

  return {
    cardDropIndicator,
    listDropIndicator,
    setListDropIndicatorIfChanged,
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    cancelPendingCardDropIndicatorRaf,
  } as const;
}

export type { ListDropIndicatorTarget };
