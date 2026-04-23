import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { db, type BoardDB, type BoardSettingsLivePatch } from '../../store/database.js';
import { transformBoard } from '../../utils/transform.js';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsRemindersOnCards,
  boardShowsStartDateOnCards,
} from '../../../shared/utils/boardCardDateVisibility.js';

interface BoardSettingsCardSettingsPanelProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
}

interface CardSettingsState {
  showReminders: boolean;
  showStartDateOnCards: boolean;
  showDueDateOnCards: boolean;
  showEndDateOnCards: boolean;
  showLabels: boolean;
  showAssignees: boolean;
  showChecklist: boolean;
  showAttachments: boolean;
  showComments: boolean;
  showListCardCount: boolean;
  showCardDescriptionPreview: boolean;
}

function readCardSettings(board: BoardDB): CardSettingsState {
  return {
    showReminders: boardShowsRemindersOnCards(board.settings),
    showStartDateOnCards: boardShowsStartDateOnCards(board.settings),
    showDueDateOnCards: boardShowsDueDateOnCards(board.settings),
    showEndDateOnCards: boardShowsEndDateOnCards(board.settings),
    showLabels: board.settings.showLabels !== false,
    showAssignees: board.settings.showAssignees !== false,
    showChecklist: board.settings.showChecklist !== false,
    showAttachments: board.settings.showAttachments !== false,
    showComments: board.settings.showComments !== false,
    showListCardCount: board.settings.showListCardCount !== false,
    showCardDescriptionPreview: board.settings.showCardDescriptionPreview !== false,
  };
}

export function BoardSettingsCardSettingsPanel({
  boardId,
  onSettingsLivePatch,
}: BoardSettingsCardSettingsPanelProps) {
  const [board, setBoard] = useState<BoardDB | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CardSettingsState>({
    showReminders: true,
    showStartDateOnCards: true,
    showDueDateOnCards: true,
    showEndDateOnCards: true,
    showLabels: true,
    showAssignees: true,
    showChecklist: true,
    showAttachments: true,
    showComments: true,
    showListCardCount: true,
    showCardDescriptionPreview: true,
  });

  const refreshBoard = useCallback(async () => {
    const row = await db.boards.get(boardId);
    if (row != null) {
      setBoard(row);
      setSettings(readCardSettings(row));
    }
  }, [boardId]);

  useEffect(() => {
    void refreshBoard();
  }, [refreshBoard]);

  const handleSave = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.updateBoard(boardId, {
        settings: {
          showStartDateOnCards: settings.showStartDateOnCards,
          showDueDateOnCards: settings.showDueDateOnCards,
          showEndDateOnCards: settings.showEndDateOnCards,
          showRemindersOnCards: settings.showReminders,
          showLabels: settings.showLabels,
          showAssignees: settings.showAssignees,
          showChecklist: settings.showChecklist,
          showAttachments: settings.showAttachments,
          showComments: settings.showComments,
          showListCardCount: settings.showListCardCount,
          showCardDescriptionPreview: settings.showCardDescriptionPreview,
        },
      });
      const next = transformBoard((response as { board: unknown }).board);
      await db.boards.put(next);
      setBoard(next);
      onSettingsLivePatch?.({
        showReminders: settings.showReminders,
        showStartDateOnCards: settings.showStartDateOnCards,
        showDueDateOnCards: settings.showDueDateOnCards,
        showEndDateOnCards: settings.showEndDateOnCards,
        showLabels: settings.showLabels,
        showAssignees: settings.showAssignees,
        showChecklist: settings.showChecklist,
        showAttachments: settings.showAttachments,
        showComments: settings.showComments,
        showListCardCount: settings.showListCardCount,
        showCardDescriptionPreview: settings.showCardDescriptionPreview,
      });
      notifications.show({
        title: 'Saved',
        message: 'Card settings have been saved.',
        color: 'green',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      notifications.show({ title: 'Error', message: msg, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  if (board == null) {
    return (
      <Text size="sm" c="dimmed">
        Loading board…
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <Text fw={700} size="lg">
        Card settings
      </Text>

      <Paper withBorder p="md" radius="md" maw={700}>
        <Stack gap="md">
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showStartDateOnCards}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({
                ...prev,
                showStartDateOnCards: checked,
              }));
            }}
            label="Start date on cards"
            description="Show or hide start dates on list cards and in the card detail panel."
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showDueDateOnCards}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({
                ...prev,
                showDueDateOnCards: checked,
              }));
            }}
            label="Due date on cards"
            description="Show or hide due dates on list cards and the due date section in card detail."
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showEndDateOnCards}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({
                ...prev,
                showEndDateOnCards: checked,
              }));
            }}
            label="End date on cards"
            description="Show or hide end dates on list cards and in the card detail panel."
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showReminders}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({
                ...prev,
                showReminders: checked,
              }));
            }}
            label="Reminders"
            description="Show or hide reminder controls on cards (reminders are tied to due dates)."
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showLabels}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showLabels: checked }));
            }}
            label="Labels"
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showAssignees}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showAssignees: checked }));
            }}
            label="Assignees"
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showChecklist}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showChecklist: checked }));
            }}
            label="Checklist"
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showAttachments}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showAttachments: checked }));
            }}
            label="Attachments"
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showComments}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showComments: checked }));
            }}
            label="Comments"
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showListCardCount}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({ ...prev, showListCardCount: checked }));
            }}
            label="Card counter on lists"
            description="Show or hide the number of cards next to each list name on this board."
          />
          <Switch
            size="sm"
            color="gray"
            labelPosition="right"
            thumbIcon={null}
            withThumbIndicator={false}
            checked={settings.showCardDescriptionPreview}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setSettings((prev) => ({
                ...prev,
                showCardDescriptionPreview: checked,
              }));
            }}
            label="Description preview on card list"
            description="If off, list cards hide the two-line preview and only show a left-aligned indicator icon when description exists."
          />
        </Stack>
      </Paper>

      {error != null ? (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      ) : null}

      <Group justify="flex-start">
        <Button onClick={() => void handleSave()} loading={loading}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
