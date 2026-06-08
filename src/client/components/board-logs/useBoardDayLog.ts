import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { eachDayOfInterval, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { api } from '../../utils/api.js';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import {
  BOARD_DAY_LOG_RETENTION_OPTIONS,
  boardDayLogRetentionSpanDays,
} from './boardDayLogRetention.js';

export type BoardDayLogRetentionField =
  | 'memberActivityLogRetentionDays'
  | 'activityLogRetentionDays';

export type BoardDayLogFetchMode =
  | { readonly memberAudit: true }
  | { readonly boardActivity: true };

export interface UseBoardDayLogOptions<TRow> {
  readonly boardId: string;
  readonly defaultRetentionDays: number;
  readonly retentionField: BoardDayLogRetentionField;
  readonly fetchMode: BoardDayLogFetchMode;
  readonly parseRow: (raw: unknown) => TRow | null;
  readonly onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
}

export function useBoardDayLog<TRow>({
  boardId,
  defaultRetentionDays,
  retentionField,
  fetchMode,
  parseRow,
  onSettingsLivePatch,
}: UseBoardDayLogOptions<TRow>) {
  const [calendarAnchor, setCalendarAnchor] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [activities, setActivities] = useState<TRow[]>([]);
  const [totalForDay, setTotalForDay] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [retentionValue, setRetentionValue] = useState<string>(String(defaultRetentionDays));
  const [savingRetention, setSavingRetention] = useState(false);

  const retentionSpanDays = useMemo(
    () => boardDayLogRetentionSpanDays(retentionValue, defaultRetentionDays),
    [retentionValue, defaultRetentionDays],
  );

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
    const preset = new Set<string>(
      BOARD_DAY_LOG_RETENTION_OPTIONS.map((o: { value: string }) => o.value),
    );
    if (retentionValue !== 'never' && !preset.has(retentionValue)) {
      return [
        ...BOARD_DAY_LOG_RETENTION_OPTIONS,
        { value: retentionValue, label: `${retentionValue} days` },
      ];
    }
    return [...BOARD_DAY_LOG_RETENTION_OPTIONS];
  }, [retentionValue]);

  const loadBoardRetention = useCallback(async () => {
    try {
      const res = await api.getBoard(boardId);
      const board = res.board as {
        settings?: {
          memberActivityLogRetentionDays?: number | null;
          activityLogRetentionDays?: number | null;
        };
      } | null;
      const days = board?.settings?.[retentionField];
      if (days === undefined) {
        setRetentionValue(String(defaultRetentionDays));
      } else {
        setRetentionValue(days === null ? 'never' : String(days));
      }
    } catch {
      setRetentionValue(String(defaultRetentionDays));
    }
  }, [boardId, retentionField, defaultRetentionDays]);

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
        ...fetchMode,
        dayStartMs: dayStart.getTime(),
        dayEndMs: dayEnd.getTime(),
      });
      if (!('total' in data)) {
        setActivities([]);
        setTotalForDay(0);
        return;
      }
      const rows = data.activities.map(parseRow).filter((r): r is TRow => r !== null);
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
  }, [boardId, selectedDayStartMs, fetchMode, parseRow]);

  useEffect(() => {
    void loadBoardRetention();
  }, [loadBoardRetention]);

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
      const settingsPatch =
        retentionField === 'memberActivityLogRetentionDays'
          ? { memberActivityLogRetentionDays: days }
          : { activityLogRetentionDays: days };
      await api.updateBoard(boardId, { settings: settingsPatch });
      setSelectedDayIndex(0);
      if (retentionField === 'memberActivityLogRetentionDays') {
        onSettingsLivePatch?.({ memberActivityLogRetentionDays: days });
      } else {
        onSettingsLivePatch?.({ activityLogRetentionDays: days });
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
    dayPagesTotal,
    canGoNewer,
    canGoOlder,
    dayLabel,
    reloadActivities: loadActivities,
  };
}
