import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { eachDayOfInterval, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { api } from '../../utils/api.js';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardMemberAuditActivities.js';
import {
  memberAuditRetentionSpanDays,
  parseActivityLogRow,
  RETENTION_OPTIONS,
  type ParsedActivityRow,
} from '../../components/activities/activityLogParts.js';

export function useActivityLog(
  boardId: string,
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void,
) {
  const [calendarAnchor, setCalendarAnchor] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [activities, setActivities] = useState<ParsedActivityRow[]>([]);
  const [totalForDay, setTotalForDay] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [retentionValue, setRetentionValue] = useState<string>(
    String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS),
  );
  const [savingRetention, setSavingRetention] = useState(false);
  const [roleLabelByKey, setRoleLabelByKey] = useState<Record<string, string>>({});

  const retentionSpanDays = useMemo(() => memberAuditRetentionSpanDays(retentionValue), [retentionValue]);

  const datePages = useMemo(() => {
    const end = startOfDay(new Date(calendarAnchor));
    const start = startOfDay(subDays(end, retentionSpanDays - 1));
    const ascending = eachDayOfInterval({ start, end });
    return ascending.slice().reverse();
  }, [retentionSpanDays, calendarAnchor]);

  useEffect(() => {
    setCalendarAnchor(Date.now());
  }, [boardId, retentionValue]);

  useEffect(() => {
    setSelectedDayIndex((i) => Math.min(Math.max(0, i), Math.max(0, datePages.length - 1)));
  }, [datePages]);

  const retentionSelectData = useMemo(() => {
    const preset = new Set<string>(RETENTION_OPTIONS.map((o: { value: string }) => o.value));
    if (retentionValue !== 'never' && !preset.has(retentionValue)) {
      return [...RETENTION_OPTIONS, { value: retentionValue, label: `${retentionValue} days` }];
    }
    return [...RETENTION_OPTIONS];
  }, [retentionValue]);

  const loadBoardRetention = useCallback(async () => {
    try {
      const res = await api.getBoard(boardId);
      const board = res.board as { settings?: { memberActivityLogRetentionDays?: number } } | null;
      const days = board?.settings?.memberActivityLogRetentionDays;
      if (days === undefined) {
        setRetentionValue(String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS));
      } else {
        setRetentionValue(days === null ? 'never' : String(days));
      }
    } catch {
      setRetentionValue(String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS));
    }
  }, [boardId]);

  const selectedDayStartMs = useMemo(() => {
    const d = datePages[selectedDayIndex];
    return d !== undefined ? startOfDay(d).getTime() : NaN;
  }, [datePages, selectedDayIndex]);

  const loadActivities = useCallback(async () => {
    if (!Number.isFinite(selectedDayStartMs)) {
      setActivities([]);
      setTotalForDay(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setForbidden(false);
      const dayStart = new Date(selectedDayStartMs);
      const dayEnd = endOfDay(dayStart);
      const data = await api.getBoardActivities(boardId, {
        memberAudit: true,
        dayStartMs: dayStart.getTime(),
        dayEndMs: dayEnd.getTime(),
      });
      if (!('total' in data)) {
        setActivities([]);
        setTotalForDay(0);
        return;
      }
      const rows = data.activities
        .map(parseActivityLogRow)
        .filter((r): r is ParsedActivityRow => r !== null);
      setActivities(rows);
      setTotalForDay(data.total);
    } catch (err: unknown) {
      const ax = err as AxiosError;
      if (ax.response?.status === 403) {
        setForbidden(true);
      }
      setActivities([]);
      setTotalForDay(0);
    } finally {
      setLoading(false);
    }
  }, [boardId, selectedDayStartMs]);

  useEffect(() => {
    void loadBoardRetention();
  }, [loadBoardRetention]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getBoardAssignableRoles(boardId)
      .then((r) => {
        if (cancelled) return;
        const roles = Array.isArray(r.roles) ? r.roles : [];
        const mapped: Record<string, string> = {
          admin: 'Admin',
          manager: 'Manager',
          viewer: 'Viewer',
        };
        for (const role of roles) {
          if (typeof role?.key === 'string' && role.key.trim() !== '') {
            mapped[role.key.trim()] =
              typeof role.displayName === 'string' && role.displayName.trim() !== ''
                ? role.displayName.trim()
                : role.key.trim();
          }
        }
        setRoleLabelByKey(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setRoleLabelByKey({ admin: 'Admin', manager: 'Manager', viewer: 'Viewer' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const resolveRoleLabel = useCallback(
    (roleKey: string) => roleLabelByKey[roleKey] ?? roleKey,
    [roleLabelByKey],
  );

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleRetentionChange = async (value: string | null): Promise<void> => {
    if (value == null) {
      return;
    }
    const prev = retentionValue;
    setRetentionValue(value);
    setSavingRetention(true);
    try {
      const days = value === 'never' ? null : parseInt(value, 10);
      if (value !== 'never' && !Number.isFinite(days)) {
        setRetentionValue(prev);
        return;
      }
      await api.updateBoard(boardId, {
        settings: {
          memberActivityLogRetentionDays: days,
        },
      });
      setSelectedDayIndex(0);
      if (days === null) {
        onSettingsLivePatch?.({ memberActivityLogRetentionDays: null });
      } else {
        onSettingsLivePatch?.({ memberActivityLogRetentionDays: days });
      }
    } catch {
      setRetentionValue(prev);
    } finally {
      setSavingRetention(false);
    }
  };

  const dayPagesTotal = datePages.length;
  const canGoNewer = selectedDayIndex > 0;
  const canGoOlder = selectedDayIndex < dayPagesTotal - 1;
  const dayLabel = useMemo(() => {
    const d = datePages[selectedDayIndex];
    return d !== undefined ? format(d, 'EEE, MMM d, yyyy') : '—';
  }, [datePages, selectedDayIndex]);

  return {
    forbidden,
    loading,
    activities,
    totalForDay,
    selectedDayIndex,
    setSelectedDayIndex,
    retentionValue,
    savingRetention,
    retentionSelectData,
    handleRetentionChange,
    resolveRoleLabel,
    dayPagesTotal,
    canGoNewer,
    canGoOlder,
    dayLabel,
  };
}
