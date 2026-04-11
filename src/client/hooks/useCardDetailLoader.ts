import { useEffect, useState, useRef } from 'react';
import { liveQuery } from 'dexie';
import { db, type CardDB } from '../store/database.js';
import { api } from '../utils/api.js';
import { normalizeCardFromApi } from '../utils/transform.js';

/**
 * Loads a single card for detail UI (Dexie first for fast paint, then GET /cards/:id).
 * Relies on Dexie `liveQuery` for realtime updates (socket handlers write to `db.cards`).
 */
export function useCardDetailLoader(cardId: string | null): {
  card: CardDB | null;
  loading: boolean;
} {
  const [card, setCard] = useState<CardDB | null>(null);
  const [loading, setLoading] = useState(!!cardId);
  const isMountedRef = useRef(true);
  const sawRowRef = useRef(false);
  const initialLoadFinishedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    sawRowRef.current = false;
    initialLoadFinishedRef.current = false;

    if (!cardId) {
      setLoading(false);
      setCard(null);
      return undefined;
    }

    const loadCard = async (): Promise<void> => {
      if (!isMountedRef.current) {
        return;
      }

      let showedCache = false;
      try {
        const cached = await db.cards.get(cardId);
        if (isMountedRef.current && cached != null) {
          sawRowRef.current = true;
          setCard(cached);
          setLoading(false);
          showedCache = true;
        }
      } catch {
        /* non-fatal */
      }

      if (!showedCache && isMountedRef.current) {
        setLoading(true);
      }

      try {
        const response = await api.getCard(cardId);
        const raw = (response as { card: unknown }).card;
        let forDexie: CardDB;
        try {
          forDexie = normalizeCardFromApi(raw, cardId);
        } catch {
          if (isMountedRef.current && !showedCache) {
            setCard(null);
          }
          return;
        }

        if (!isMountedRef.current) {
          return;
        }

        try {
          await db.cards.put(forDexie);
        } catch {
          /* Dexie put failed; UI still shows from memory */
        }
        if (isMountedRef.current) {
          sawRowRef.current = true;
          setCard(forDexie);
        }
      } catch {
        if (isMountedRef.current && !showedCache) {
          setCard(null);
        }
      } finally {
        if (isMountedRef.current) {
          initialLoadFinishedRef.current = true;
          setLoading(false);
        }
      }
    };

    void loadCard();

    const dexieSub = liveQuery(() => db.cards.get(cardId)).subscribe({
      next: (row) => {
        if (!isMountedRef.current) {
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
