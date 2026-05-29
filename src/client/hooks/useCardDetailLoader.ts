import { useEffect, useState, useRef } from 'react';
import { liveQuery } from 'dexie';
import { db, type CardDB } from '../store/database.js';
import { api } from '../utils/api.js';
import { capMapSize } from '../utils/capMapSize.js';
import { normalizeCardFromApi } from '../utils/transform.js';

const MAX_CARD_DETAIL_WARM_CACHE = 96;
const cardDetailWarmCache = new Map<string, CardDB>();
const inFlightPrefetches = new Map<string, Promise<void>>();

function setCardDetailWarmCache(cardId: string, card: CardDB): void {
  if (cardDetailWarmCache.has(cardId)) {
    cardDetailWarmCache.delete(cardId);
  }
  cardDetailWarmCache.set(cardId, card);
  capMapSize(cardDetailWarmCache, MAX_CARD_DETAIL_WARM_CACHE);
}

export function clearCardDetailWarmCacheForBoard(boardId: string): void {
  const bid = boardId.trim();
  if (bid === '') {
    return;
  }
  for (const [cardId, card] of cardDetailWarmCache) {
    if (card.boardId === bid) {
      cardDetailWarmCache.delete(cardId);
    }
  }
}

export function prefetchCardDetail(cardId: string, seed?: CardDB): void {
  if (cardId.trim() === '') {
    return;
  }
  if (seed != null && seed.id === cardId) {
    setCardDetailWarmCache(cardId, seed);
  }
  if (inFlightPrefetches.has(cardId)) {
    return;
  }
  const p = (async (): Promise<void> => {
    try {
      const response = await api.getCard(cardId);
      const raw = (response as { card: unknown }).card;
      const normalized = normalizeCardFromApi(raw, cardId);
      setCardDetailWarmCache(cardId, normalized);
      try {
        await db.cards.put(normalized);
      } catch {
        /* cache write best effort */
      }
    } catch {
      /* prefetch best effort */
    } finally {
      inFlightPrefetches.delete(cardId);
    }
  })();
  inFlightPrefetches.set(cardId, p);
}

/**
 * Loads a single card for detail UI (Dexie first for fast paint, then GET /cards/:id).
 * Relies on Dexie `liveQuery` for realtime updates (socket handlers write to `db.cards`).
 */
export function useCardDetailLoader(cardId: string | null, initialCard?: CardDB): {
  card: CardDB | null;
  loading: boolean;
} {
  /** Parent often passes a new object reference for the same tile; do not put in effect deps (would reset Dexie liveQuery + refetch). */
  const initialCardRef = useRef(initialCard);
  initialCardRef.current = initialCard;

  const [card, setCard] = useState<CardDB | null>(() =>
    cardId != null && initialCard?.id === cardId
      ? initialCard
      : cardId != null
        ? (cardDetailWarmCache.get(cardId) ?? null)
        : null,
  );
  const [loading, setLoading] = useState(
    () =>
      !(
        (cardId != null && initialCard?.id === cardId) ||
        (cardId != null && cardDetailWarmCache.has(cardId))
      ),
  );
  const isMountedRef = useRef(true);
  const sawRowRef = useRef(false);
  const initialLoadFinishedRef = useRef(false);
  /** Bumps when `cardId` changes so an in-flight fetch for a previous id cannot call `setCard`. */
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    sawRowRef.current = false;
    initialLoadFinishedRef.current = false;
    const loadGeneration = ++loadGenerationRef.current;

    if (!cardId) {
      setLoading(false);
      setCard(null);
      return undefined;
    }
    const init = initialCardRef.current;
    const hasMatchingInitial = init?.id === cardId;
    if (hasMatchingInitial && init != null) {
      sawRowRef.current = true;
      setCard(init);
      setLoading(false);
    } else {
      const warmed = cardDetailWarmCache.get(cardId) ?? null;
      if (warmed != null) {
        sawRowRef.current = true;
        setCard(warmed);
        setLoading(false);
      } else {
        setCard(null);
        setLoading(true);
      }
    }

    const loadCard = async (): Promise<void> => {
      if (!isMountedRef.current || loadGenerationRef.current !== loadGeneration) {
        return;
      }

      let showedCache = hasMatchingInitial;
      try {
        const cached = await db.cards.get(cardId);
        if (
          isMountedRef.current &&
          loadGenerationRef.current === loadGeneration &&
          cached != null
        ) {
          sawRowRef.current = true;
          setCard(cached);
          setLoading(false);
          showedCache = true;
        }
      } catch {
        /* non-fatal */
      }

      if (!showedCache && isMountedRef.current && loadGenerationRef.current === loadGeneration) {
        setLoading(true);
      }

      try {
        const response = await api.getCard(cardId);
        if (loadGenerationRef.current !== loadGeneration) {
          return;
        }
        const raw = (response as { card: unknown }).card;
        let forDexie: CardDB;
        try {
          forDexie = normalizeCardFromApi(raw, cardId);
        } catch {
          if (isMountedRef.current && loadGenerationRef.current === loadGeneration && !showedCache) {
            setCard(null);
          }
          return;
        }

        if (!isMountedRef.current || loadGenerationRef.current !== loadGeneration) {
          return;
        }

        try {
          await db.cards.put(forDexie);
        } catch {
          /* Dexie put failed; UI still shows from memory */
        }
        if (isMountedRef.current && loadGenerationRef.current === loadGeneration) {
          sawRowRef.current = true;
          setCard(forDexie);
        }
      } catch {
        if (isMountedRef.current && loadGenerationRef.current === loadGeneration && !showedCache) {
          setCard(null);
        }
      } finally {
        if (isMountedRef.current && loadGenerationRef.current === loadGeneration) {
          initialLoadFinishedRef.current = true;
          setLoading(false);
        }
      }
    };

    void loadCard();

    const dexieSub = liveQuery(() => db.cards.get(cardId)).subscribe({
      next: (row) => {
        if (!isMountedRef.current || loadGenerationRef.current !== loadGeneration) {
          return;
        }
        if (row != null) {
          sawRowRef.current = true;
          setCard(row);
          return;
        }
        if (sawRowRef.current && initialLoadFinishedRef.current) {
          setCard(null);
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      dexieSub.unsubscribe();
    };
  }, [cardId]);

  return { card, loading };
}
