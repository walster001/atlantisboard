import { useEffect, useState, useRef } from 'react';
import { liveQuery } from 'dexie';
import { db, type CardDB } from '../store/database.js';
import { api } from '../utils/api.js';
import { normalizeCardFromApi } from '../utils/transform.js';

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
    cardId != null && initialCard?.id === cardId ? initialCard : null,
  );
  const [loading, setLoading] = useState(() => !(cardId != null && initialCard?.id === cardId));
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
      setCard(null);
      setLoading(true);
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
