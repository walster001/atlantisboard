import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminReportingDaysFilterValue } from '../../../../shared/constants/adminReporting.js';
import { ADMIN_REPORTING_MEMBER_ACTIVITY_PAGE_SIZE } from '../../../../shared/constants/adminReporting.js';
import { api } from '../../../utils/api.js';
import {
  parseAdminMemberAuditRow,
  type ParsedAdminMemberAuditRow,
} from './adminReportingMemberActivityUtils.js';

const DEFAULT_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  viewer: 'Viewer',
};

function buildRoleLabelMap(roles: readonly unknown[]): Record<string, string> {
  const mapped: Record<string, string> = { ...DEFAULT_ROLE_LABELS };
  for (const role of roles) {
    if (role == null || typeof role !== 'object') {
      continue;
    }
    const record = role as { key?: unknown; displayName?: unknown };
    if (typeof record.key === 'string' && record.key.trim() !== '') {
      const key = record.key.trim();
      mapped[key] =
        typeof record.displayName === 'string' && record.displayName.trim() !== ''
          ? record.displayName.trim()
          : key;
    }
  }
  return mapped;
}

export function useAdminReportingMemberActivity(
  boardFilterId: string | null,
  daysFilter: AdminReportingDaysFilterValue,
) {
  const [rows, setRows] = useState<readonly ParsedAdminMemberAuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleLabelByKey, setRoleLabelByKey] = useState<Record<string, string>>(DEFAULT_ROLE_LABELS);
  const pagingLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .getRoles()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRoleLabelByKey(buildRoleLabelMap(Array.isArray(response.roles) ? response.roles : []));
      })
      .catch(() => {
        if (!cancelled) {
          setRoleLabelByKey(DEFAULT_ROLE_LABELS);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        const response = await api.getAdminReportingMemberActivity({
          limit: ADMIN_REPORTING_MEMBER_ACTIVITY_PAGE_SIZE,
          days,
          ...(cursor !== undefined ? { cursor } : {}),
          ...(boardId != null ? { boardId } : {}),
        });
        const parsed = response.activities.flatMap((activity) => {
          const row = parseAdminMemberAuditRow(activity);
          return row != null ? [row] : [];
        });
        setRows((prev) => (isMore ? [...prev, ...parsed] : parsed));
        setNextCursor(response.nextCursor);
        setError(null);
      } catch {
        setError('Failed to load member activity.');
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

  const resolveRoleLabel = useCallback(
    (roleKey: string) => roleLabelByKey[roleKey] ?? roleKey,
    [roleLabelByKey],
  );

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
    resolveRoleLabel,
    handleEndReached,
    hasMore: nextCursor != null,
    refresh,
  };
}
