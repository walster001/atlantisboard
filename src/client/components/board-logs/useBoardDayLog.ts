import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export type BoardDayLogMode = 'memberAudit' | 'boardActivity';

export interface UseBoardDayLogOptions<TRow> {
  readonly boardId: string;
  readonly defaultRetentionDays: number;
  readonly retentionField: BoardDayLogRetentionField;
  /** Stable string — do not pass inline objects (avoids refetch loops). */
  readonly mode: BoardDayLogMode;
  readonly parseRow: (raw: unknown) => TRow | null;
  readonly onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
  /** When true, parent loads retention via {@link applyRetentionFromBoard}. */
  readonly skipRetentionFetch?: boolean;
}

export function useBoardDayLog<TRow>({
  boardId,
  defaultRetentionDays,
  retentionField,
  mode,
  parseRow,
  onSettingsLivePatch,
  skipRetentionFetch = false,
}: UseBoardDayLogOptions<TRow>) {
  const [calendarAnchor, setCalendarAnchor] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [activities, setActivities] = useState<TRow[]>([]);
  const [totalForDay, setTotalForDay] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [retentionValue, setRetentionValue] = useState<string>(String(defaultRetentionDays));
  const [savingRetention, setSavingRetention] = useState(false);
  const activitiesFetchGenRef = useRef(0);

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
    const fetchId = ++activitiesFetchGenRef.current;
    if (!Number.isFinite(selectedDayStartMs)) {
      setActivities([]);
      setTotalForDay(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setForbidden(false);
      setRateLimited(false);
      const dayStart = new Date(selectedDayStartMs);
      const dayEnd = endOfDay(dayStart);
      const data = await api.getBoardActivities(boardId, {
        ...(mode === 'memberAudit' ? { memberAudit: true } : { boardActivity: true }),
        dayStartMs: dayStart.getTime(),
        dayEndMs: dayEnd.getTime(),
      });
      if (fetchId !== activitiesFetchGenRef.current) {
        return;
      }
      if (!('total' in data)) {
        setActivities([]);
        setTotalForDay(0);
        return;
      }
      const rows = data.activities.map(parseRow).filter((r): r is TRow => r !== null);
      setActivities(rows);
      setTotalForDay(data.total);
    } catch (err: unknown) {
      if (fetchId !== activitiesFetchGenRef.current) {
        return;
      }
      const ax = err as AxiosError;
      if (ax.response?.status === 403) {
        setForbidden(true);
      } else if (ax.response?.status === 429) {
        setRateLimited(true);
      }
      setActivities([]);
      setTotalForDay(0);
    } finally {
      if (fetchId === activitiesFetchGenRef.current) {
        setLoading(false);
      }
    }
  }, [boardId, selectedDayStartMs, mode, parseRow]);

  const applyRetentionFromBoard = useCallback(
    (days: number | null | undefined) => {
      if (days === undefined) {
        setRetentionValue(String(defaultRetentionDays));
      } else {
        setRetentionValue(days === null ? 'never' : String(days));
      }
    },
    [defaultRetentionDays],
  );

  useEffect(() => {
    if (!skipRetentionFetch) {
      void loadBoardRetention();
    }
  }, [loadBoardRetention, skipRetentionFetch]);

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
    rateLimited,
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
    applyRetentionFromBoard,
  };
}
