import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE } from '../../../../shared/constants/adminReporting.js';
import { api } from '../../../utils/api.js';
import {
  parseAdminBoardListRow,
  type AdminBoardListRow,
} from './adminReportingBoardListUtils.js';

export function useAdminReportingBoardList() {
  const [boards, setBoards] = useState<readonly AdminBoardListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const pagingLockRef = useRef(false);

  const loadBoards = useCallback(async (cursor?: string): Promise<void> => {
    const isMore = cursor != null;
    if (isMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await api.getAdminReportingBoardList({
        limit: ADMIN_REPORTING_BOARD_LIST_PAGE_SIZE,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      const incoming = response.boards.flatMap((row) => {
        const parsed = parseAdminBoardListRow(row);
        return parsed != null ? [parsed] : [];
      });

      if (isMore) {
        setBoards((prev) => {
          const seen = new Set(prev.map((board) => board._id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row._id)) {
              seen.add(row._id);
              merged.push(row);
            }
          }
          return merged;
        });
      } else {
        setBoards(incoming);
      }
      setNextCursor(response.nextCursor);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load boards';
      setError(message);
      if (!isMore) {
        setBoards([]);
        setNextCursor(undefined);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const handleEndReached = useCallback((): void => {
    if (nextCursor == null || loading || loadingMore || pagingLockRef.current) {
      return;
    }
    pagingLockRef.current = true;
    void (async () => {
      try {
        await loadBoards(nextCursor);
      } finally {
        pagingLockRef.current = false;
      }
    })();
  }, [loadBoards, loading, loadingMore, nextCursor]);

  const removeBoard = useCallback((boardId: string): void => {
    setBoards((prev) => prev.filter((board) => board._id !== boardId));
  }, []);

  return {
    boards,
    loading,
    loadingMore,
    error,
    handleEndReached,
    hasMore: nextCursor != null,
    removeBoard,
  };
}
