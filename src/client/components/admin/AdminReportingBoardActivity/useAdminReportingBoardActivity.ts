import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminReportingDaysFilterValue } from '../../../../shared/constants/adminReporting.js';
import { ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE } from '../../../../shared/constants/adminReporting.js';
import { api } from '../../../utils/api.js';
import {
  parseAdminBoardActivityRow,
  type ParsedAdminBoardActivityRow,
} from './adminReportingBoardActivityUtils.js';

export function useAdminReportingBoardActivity(
  boardFilterId: string | null,
  daysFilter: AdminReportingDaysFilterValue,
) {
  const [rows, setRows] = useState<readonly ParsedAdminBoardActivityRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagingLockRef = useRef(false);

  const loadPage = useCallback(
    async (
      cursor?: string,
      days = daysFilter,
      boardId = boardFilterId,
    ): Promise<void> => {
      const isMore = cursor != null;
      if (isMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const response = await api.getAdminReportingBoardActivity({
          limit: ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE,
          days,
          ...(cursor !== undefined ? { cursor } : {}),
          ...(boardId != null ? { boardId } : {}),
        });
        const parsed = response.activities.flatMap((activity) => {
          const row = parseAdminBoardActivityRow(activity);
          return row != null ? [row] : [];
        });
        setRows((prev) => (isMore ? [...prev, ...parsed] : parsed));
        setNextCursor(response.nextCursor);
        setError(null);
      } catch {
        setError('Failed to load board activity.');
        if (!isMore) {
          setRows([]);
          setNextCursor(undefined);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [boardFilterId, daysFilter],
  );

  useEffect(() => {
    void loadPage(undefined, daysFilter, boardFilterId);
  }, [boardFilterId, daysFilter, loadPage]);

  const handleEndReached = useCallback((): void => {
    if (nextCursor == null || loading || loadingMore || pagingLockRef.current) {
      return;
    }
    pagingLockRef.current = true;
    void (async () => {
      try {
        await loadPage(nextCursor, daysFilter, boardFilterId);
      } finally {
        pagingLockRef.current = false;
      }
    })();
  }, [boardFilterId, daysFilter, loadPage, loading, loadingMore, nextCursor]);

  const refresh = useCallback((): void => {
    void loadPage(undefined, daysFilter, boardFilterId);
  }, [boardFilterId, daysFilter, loadPage]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    handleEndReached,
    hasMore: nextCursor != null,
    refresh,
  };
}
