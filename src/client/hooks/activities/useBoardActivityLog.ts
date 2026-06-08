import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { isAxiosError } from 'axios';
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
  const [activityLogEmailRoundupEnabled, setActivityLogEmailRoundupEnabled] = useState(false);
  const [activityLogEmailRoundupUserIds, setActivityLogEmailRoundupUserIds] =
    useState<readonly string[]>([]);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [savingEmailRoundupEnabled, setSavingEmailRoundupEnabled] = useState(false);
  const [sendingManualRoundup, setSendingManualRoundup] = useState(false);

  const dayLog = useBoardDayLog({
    boardId,
    defaultRetentionDays: BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
    retentionField: 'activityLogRetentionDays',
    mode: 'boardActivity',
    parseRow: parseBoardActivityRow,
    skipRetentionFetch: true,
    ...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {}),
  });

  const { applyRetentionFromBoard } = dayLog;

  const loadBoardSettings = useCallback(async () => {
    try {
      const res = await api.getBoard(boardId);
      const board = res.board as {
        settings?: {
          activityLogEnabled?: boolean;
          activityLogRetentionDays?: number | null;
          activityLogTracking?: BoardActivityTrackingSettings;
          activityLogEmailRoundupEnabled?: boolean;
          activityLogEmailRoundupUserIds?: readonly string[];
        };
      } | null;
      setActivityLogEnabled(board?.settings?.activityLogEnabled === true);
      applyRetentionFromBoard(board?.settings?.activityLogRetentionDays);
      const tracking = board?.settings?.activityLogTracking;
      setActivityLogTracking({
        ...DEFAULT_BOARD_ACTIVITY_TRACKING,
        ...(tracking != null && typeof tracking === 'object' ? tracking : {}),
      });
      setActivityLogEmailRoundupEnabled(board?.settings?.activityLogEmailRoundupEnabled === true);
      const recipientIds = board?.settings?.activityLogEmailRoundupUserIds;
      setActivityLogEmailRoundupUserIds(
        Array.isArray(recipientIds) ? recipientIds.filter((id) => typeof id === 'string') : [],
      );
    } catch {
      setActivityLogEnabled(false);
      applyRetentionFromBoard(undefined);
      setActivityLogTracking(DEFAULT_BOARD_ACTIVITY_TRACKING);
      setActivityLogEmailRoundupEnabled(false);
      setActivityLogEmailRoundupUserIds([]);
    }
  }, [boardId, applyRetentionFromBoard]);

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

  const handleEmailRoundupEnabledChange = async (enabled: boolean): Promise<void> => {
    const prev = activityLogEmailRoundupEnabled;
    setActivityLogEmailRoundupEnabled(enabled);
    setSavingEmailRoundupEnabled(true);
    try {
      await api.updateBoard(boardId, {
        settings: { activityLogEmailRoundupEnabled: enabled },
      });
      onSettingsLivePatch?.({ activityLogEmailRoundupEnabled: enabled });
    } catch {
      setActivityLogEmailRoundupEnabled(prev);
      throw new Error('Failed to save email roundup setting');
    } finally {
      setSavingEmailRoundupEnabled(false);
    }
  };

  const readApiErrorMessage = (error: unknown, fallback: string): string => {
    if (isAxiosError(error)) {
      const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error
        ?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message.trim();
      }
    }
    if (error instanceof Error && error.message.trim() !== '') {
      return error.message.trim();
    }
    return fallback;
  };

  const handleSendManualRoundup = async (): Promise<void> => {
    setSendingManualRoundup(true);
    try {
      const result = await api.sendBoardActivityRoundup(boardId);
      const recipientLabel = result.sent === 1 ? 'recipient' : 'recipients';
      const eventLabel = result.activityCount === 1 ? 'event' : 'events';
      notifications.show({
        title: 'Roundup sent',
        message: `Sent to ${result.sent} ${recipientLabel} (${result.activityCount} ${eventLabel}, ${result.periodLabel}).`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Roundup failed',
        message: readApiErrorMessage(error, 'Failed to send roundup email'),
        color: 'red',
      });
    } finally {
      setSendingManualRoundup(false);
    }
  };

  const handleEmailRoundupUserIdsChange = async (ids: readonly string[]): Promise<void> => {
    const prev = activityLogEmailRoundupUserIds;
    setActivityLogEmailRoundupUserIds(ids);
    try {
      await api.updateBoard(boardId, {
        settings: { activityLogEmailRoundupUserIds: [...ids] },
      });
      onSettingsLivePatch?.({ activityLogEmailRoundupUserIds: [...ids] });
    } catch {
      setActivityLogEmailRoundupUserIds(prev);
      throw new Error('Failed to save email roundup recipients');
    }
  };

  return {
    ...dayLog,
    activityLogEnabled,
    activityLogTracking,
    activityLogEmailRoundupEnabled,
    activityLogEmailRoundupUserIds,
    savingEnabled,
    savingEmailRoundupEnabled,
    sendingManualRoundup,
    handleEnabledChange,
    handleTrackingSave,
    handleEmailRoundupEnabledChange,
    handleEmailRoundupUserIdsChange,
    handleSendManualRoundup,
    reloadBoardSettings: loadBoardSettings,
  };
}
