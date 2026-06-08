import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import {
  BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
  DEFAULT_BOARD_ACTIVITY_TRACKING,
  type BoardActivityTrackingSettings,
} from '../../../shared/constants/boardContentActivities.js';
import { useBoardDayLog } from '../../components/board-logs/useBoardDayLog.js';
import { parseBoardActivityRow } from '../../components/activities/boardActivityLogParts.js';

export function useBoardActivityLog(
  boardId: string,
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void,
) {
  const [activityLogEnabled, setActivityLogEnabled] = useState(false);
  const [activityLogTracking, setActivityLogTracking] = useState<BoardActivityTrackingSettings>(
    DEFAULT_BOARD_ACTIVITY_TRACKING,
  );
  const [savingEnabled, setSavingEnabled] = useState(false);

  const dayLog = useBoardDayLog({
    boardId,
    defaultRetentionDays: BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
    retentionField: 'activityLogRetentionDays',
    fetchMode: { boardActivity: true },
    parseRow: parseBoardActivityRow,
    ...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {}),
  });

  const loadBoardSettings = useCallback(async () => {
    try {
      const res = await api.getBoard(boardId);
      const board = res.board as {
        settings?: {
          activityLogEnabled?: boolean;
          activityLogTracking?: BoardActivityTrackingSettings;
        };
      } | null;
      setActivityLogEnabled(board?.settings?.activityLogEnabled === true);
      const tracking = board?.settings?.activityLogTracking;
      setActivityLogTracking({
        ...DEFAULT_BOARD_ACTIVITY_TRACKING,
        ...(tracking != null && typeof tracking === 'object' ? tracking : {}),
      });
    } catch {
      setActivityLogEnabled(false);
      setActivityLogTracking(DEFAULT_BOARD_ACTIVITY_TRACKING);
    }
  }, [boardId]);

  useEffect(() => {
    void loadBoardSettings();
  }, [loadBoardSettings]);

  const handleEnabledChange = async (enabled: boolean): Promise<void> => {
    const prev = activityLogEnabled;
    setActivityLogEnabled(enabled);
    setSavingEnabled(true);
    try {
      await api.updateBoard(boardId, {
        settings: { activityLogEnabled: enabled },
      });
      onSettingsLivePatch?.({ activityLogEnabled: enabled });
    } catch {
      setActivityLogEnabled(prev);
    } finally {
      setSavingEnabled(false);
    }
  };

  const handleTrackingSave = async (tracking: BoardActivityTrackingSettings): Promise<void> => {
    const prev = activityLogTracking;
    setActivityLogTracking(tracking);
    try {
      await api.updateBoard(boardId, {
        settings: { activityLogTracking: tracking },
      });
      onSettingsLivePatch?.({ activityLogTracking: tracking });
    } catch {
      setActivityLogTracking(prev);
      throw new Error('Failed to save activity tracking settings');
    }
  };

  return {
    ...dayLog,
    activityLogEnabled,
    activityLogTracking,
    savingEnabled,
    handleEnabledChange,
    handleTrackingSave,
    reloadBoardSettings: loadBoardSettings,
  };
}
