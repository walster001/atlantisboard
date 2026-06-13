import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE } from '../../../../shared/constants/adminReporting.js';
import { BOARD_CONTENT_DEFAULT_RETENTION_DAYS } from '../../../../shared/constants/boardContentActivities.js';
import {
  buildBoardDayLogRetentionSelectData,
} from '../../board-logs/boardDayLogRetention.js';
import { api } from '../../../utils/api.js';
import {
  parseAdminBoardActivityRow,
  type ParsedAdminBoardActivityRow,
} from './adminReportingBoardActivityUtils.js';

export function useAdminReportingBoardActivity(boardFilterId: string | null) {
  const [rows, setRows] = useState<readonly ParsedAdminBoardActivityRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retentionValue, setRetentionValue] = useState<string>(
    String(BOARD_CONTENT_DEFAULT_RETENTION_DAYS),
  );
  const pagingLockRef = useRef(false);

  const retentionSelectData = useMemo(
    () => buildBoardDayLogRetentionSelectData(retentionValue),
    [retentionValue],
  );

  const loadPage = useCallback(
    async (
      cursor?: string,
      retention = retentionValue,
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
          retention,
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
    [boardFilterId, retentionValue],
  );

  useEffect(() => {
    void loadPage(undefined, retentionValue, boardFilterId);
  }, [boardFilterId, loadPage, retentionValue]);

  const handleRetentionChange = useCallback((value: string | null): void => {
    if (value == null) {
      return;
    }
    setRetentionValue(value);
  }, []);

  const handleEndReached = useCallback((): void => {
    if (nextCursor == null || loading || loadingMore || pagingLockRef.current) {
      return;
    }
    pagingLockRef.current = true;
    void (async () => {
      try {
        await loadPage(nextCursor, retentionValue, boardFilterId);
      } finally {
        pagingLockRef.current = false;
      }
    })();
  }, [boardFilterId, loadPage, loading, loadingMore, nextCursor, retentionValue]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    handleEndReached,
    hasMore: nextCursor != null,
    retentionValue,
    retentionSelectData,
    handleRetentionChange,
  };
}
