import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';
import { cardDropIndicatorsEqual, listDropIndicatorsEqual, type ListDropIndicatorTarget } from './helpers.js';

interface KanbanDropIndicatorsController {
  readonly cardDropIndicator: CardDropIndicatorTarget | null;
  readonly listDropIndicator: ListDropIndicatorTarget | null;
  readonly queueCardDropIndicator: (next: CardDropIndicatorTarget | null) => void;
  readonly flushCardDropIndicatorNow: (next: CardDropIndicatorTarget | null) => void;
  readonly setListDropIndicatorIfChanged: (next: ListDropIndicatorTarget | null) => void;
  readonly cancelPendingCardDropIndicatorRaf: () => void;
  readonly cardDropIndicatorRef: MutableRefObject<CardDropIndicatorTarget | null>;
}

export function useKanbanDropIndicators(): KanbanDropIndicatorsController {
  const [cardDropIndicator, setCardDropIndicator] = useState<CardDropIndicatorTarget | null>(null);
  const cardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  const [listDropIndicator, setListDropIndicator] = useState<ListDropIndicatorTarget | null>(null);
  const listDropIndicatorRef = useRef<ListDropIndicatorTarget | null>(null);
  const pendingCardDropIndicatorRef = useRef<CardDropIndicatorTarget | null>(null);
  const cardDropIndicatorRafRef = useRef<number | null>(null);

  const cancelPendingCardDropIndicatorRaf = useCallback((): void => {
    const id = cardDropIndicatorRafRef.current;
    if (id != null) {
      cancelAnimationFrame(id);
      cardDropIndicatorRafRef.current = null;
    }
  }, []);

  const setCardDropIndicatorIfChanged = useCallback((next: CardDropIndicatorTarget | null) => {
    // Compare React state, not cardDropIndicatorRef: queueCardDropIndicator updates the ref
    // before RAF so onDrop reads the latest target; comparing ref here would skip setState.
    setCardDropIndicator((prev) => {
      if (cardDropIndicatorsEqual(prev, next)) {
        return prev;
      }
      cardDropIndicatorRef.current = next;
      return next;
    });
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
      if (
        cardDropIndicatorRafRef.current == null &&
        cardDropIndicatorsEqual(cardDropIndicatorRef.current, next)
      ) {
        return;
      }
      pendingCardDropIndicatorRef.current = next;
      cardDropIndicatorRef.current = next;
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
    queueCardDropIndicator,
    flushCardDropIndicatorNow,
    setListDropIndicatorIfChanged,
    cancelPendingCardDropIndicatorRaf,
    cardDropIndicatorRef,
  };
}
