import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_REPORTING_CARD_LIST_PAGE_SIZE } from '../../../../shared/constants/adminReporting.js';
import { api } from '../../../utils/api.js';
import type { AdminReportingCardListRow } from './adminReportingCardListUtils.js';

export function useAdminReportingCardList() {
  const [rows, setRows] = useState<readonly AdminReportingCardListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagingLockRef = useRef(false);

  const loadPage = useCallback(async (cursor?: string): Promise<void> => {
    const isMore = cursor != null;
    if (isMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await api.getAdminReportingCardList({
        limit: ADMIN_REPORTING_CARD_LIST_PAGE_SIZE,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      setRows((prev) => {
        if (!isMore) {
          return response.cards;
        }
        const seen = new Set(prev.map((row) => row._id));
        const merged = [...prev];
        for (const row of response.cards) {
          if (!seen.has(row._id)) {
            seen.add(row._id);
            merged.push(row);
          }
        }
        return merged;
      });
      setNextCursor(response.nextCursor);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load cards';
      setError(message);
      if (!isMore) {
        setRows([]);
        setNextCursor(undefined);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleEndReached = useCallback((): void => {
    if (nextCursor == null || loading || loadingMore || pagingLockRef.current) {
      return;
    }
    pagingLockRef.current = true;
    void (async () => {
      try {
        await loadPage(nextCursor);
      } finally {
        pagingLockRef.current = false;
      }
    })();
  }, [loadPage, loading, loadingMore, nextCursor]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    handleEndReached,
  };
}
