import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Switch, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { db, type BoardDB, type BoardSettingsLivePatch } from '../../store/database.js';
import { transformBoard } from '../../utils/transform.js';
import {
  DEFAULT_BOARD_LIST_MAX_CARDS,
  getBoardListCardLimits,
} from '../../utils/boardListLimits.js';
import {
  BOARD_LIST_COLUMN_WIDTH_MAX_PX,
  BOARD_LIST_COLUMN_WIDTH_MIN_PX,
  DEFAULT_LIST_COLUMN_WIDTH_PX,
  getBoardListColumnWidthPx,
} from '../../utils/boardListColumnWidth.js';

function clampListColumnWidthPx(n: number): number {
  return Math.min(
    BOARD_LIST_COLUMN_WIDTH_MAX_PX,
    Math.max(BOARD_LIST_COLUMN_WIDTH_MIN_PX, Math.round(n)),
  );
}

const LIST_MAX_CARDS_MIN = 1;
const LIST_MAX_CARDS_MAX = 100_000;

function clampListMaxCards(n: number): number {
  return Math.min(LIST_MAX_CARDS_MAX, Math.max(LIST_MAX_CARDS_MIN, Math.round(n)));
}

interface BoardSettingsListSettingsPanelProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
}

export function BoardSettingsListSettingsPanel({
  boardId,
  onSettingsLivePatch,
}: BoardSettingsListSettingsPanelProps) {
  const [board, setBoard] = useState<BoardDB | null>(null);
  const [maxCards, setMaxCards] = useState<number>(DEFAULT_BOARD_LIST_MAX_CARDS);
  const [maxCardsDraft, setMaxCardsDraft] = useState<string>(String(DEFAULT_BOARD_LIST_MAX_CARDS));
  const [enforceMaxCards, setEnforceMaxCards] = useState<boolean>(true);
  const [listColumnWidthPx, setListColumnWidthPx] = useState<number>(DEFAULT_LIST_COLUMN_WIDTH_PX);
  const [widthDraft, setWidthDraft] = useState<string>(String(DEFAULT_LIST_COLUMN_WIDTH_PX));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    const row = await db.boards.get(boardId);
    if (row != null) {
      setBoard(row);
      const { max, enforce } = getBoardListCardLimits(row);
      setMaxCards(max);
      setMaxCardsDraft(String(max));
      setEnforceMaxCards(enforce);
      const w = getBoardListColumnWidthPx(row);
      setListColumnWidthPx(w);
      setWidthDraft(String(w));
    }
  }, [boardId]);

  useEffect(() => {
    void refreshBoard();
  }, [refreshBoard]);

  const handleSave = async (): Promise<void> => {
    const digits = widthDraft.replace(/\D/g, '');
    if (digits === '') {
      notifications.show({
        title: 'Enter a width',
        message: `Use a number from ${BOARD_LIST_COLUMN_WIDTH_MIN_PX} to ${BOARD_LIST_COLUMN_WIDTH_MAX_PX}.`,
        color: 'yellow',
      });
      setWidthDraft(String(listColumnWidthPx));
      return;
    }
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isFinite(parsed)) {
      setWidthDraft(String(listColumnWidthPx));
      return;
    }
    const columnWidthPx = clampListColumnWidthPx(parsed);
    if (columnWidthPx !== parsed) {
      notifications.show({
        title: 'Width adjusted',
        message: `Clamped to ${BOARD_LIST_COLUMN_WIDTH_MIN_PX}–${BOARD_LIST_COLUMN_WIDTH_MAX_PX}px.`,
        color: 'blue',
      });
    }
    setListColumnWidthPx(columnWidthPx);
    setWidthDraft(String(columnWidthPx));

    const maxDigits = maxCardsDraft.replace(/\D/g, '');
    if (maxDigits === '') {
      notifications.show({
        title: 'Enter max cards',
        message: `Use a whole number from ${LIST_MAX_CARDS_MIN.toLocaleString()} to ${LIST_MAX_CARDS_MAX.toLocaleString()}.`,
        color: 'yellow',
      });
      setMaxCardsDraft(String(maxCards));
      return;
    }
    const maxParsed = Number.parseInt(maxDigits, 10);
    if (!Number.isFinite(maxParsed)) {
      setMaxCardsDraft(String(maxCards));
      return;
    }
    const listMaxCardsResolved = clampListMaxCards(maxParsed);
    if (listMaxCardsResolved !== maxParsed) {
      notifications.show({
        title: 'Limit adjusted',
        message: `Clamped to ${LIST_MAX_CARDS_MIN.toLocaleString()}–${LIST_MAX_CARDS_MAX.toLocaleString()}.`,
        color: 'blue',
      });
    }
    setMaxCards(listMaxCardsResolved);
    setMaxCardsDraft(String(listMaxCardsResolved));

    setLoading(true);
    setError(null);
    try {
      const response = await api.updateBoard(boardId, {
        settings: {
          listMaxCards: listMaxCardsResolved,
          listEnforceMaxCards: enforceMaxCards,
          listColumnWidthAuto: true,
          listColumnWidthPx: columnWidthPx,
        },
      });
      const next = transformBoard((response as { board: unknown }).board);
      await db.boards.put(next);
      setBoard(next);
      const w = getBoardListColumnWidthPx(next);
      setListColumnWidthPx(w);
      setWidthDraft(String(w));
      const limits = getBoardListCardLimits(next);
      setMaxCards(limits.max);
      setMaxCardsDraft(String(limits.max));
      setEnforceMaxCards(limits.enforce);
      onSettingsLivePatch?.({
        listMaxCards: limits.max,
        listEnforceMaxCards: limits.enforce,
        listColumnWidthAuto: true,
        listColumnWidthPx: w,
      });
      notifications.show({
        title: 'Saved',
        message: 'List settings have been saved.',
        color: 'green',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      notifications.show({ title: 'Error', message: msg, color: 'red' });
      void refreshBoard();
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
        List settings
      </Text>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">
          List sizing
        </Text>
        <TextInput
          label="Default column width"
          description={`Used on wide screens; columns narrow automatically on smaller viewports (${BOARD_LIST_COLUMN_WIDTH_MIN_PX}–${BOARD_LIST_COLUMN_WIDTH_MAX_PX}px). Saved with the button below for everyone on this board.`}
          value={widthDraft}
          onChange={(e) => {
            setWidthDraft(e.currentTarget.value);
          }}
          inputMode="numeric"
          disabled={loading}
          style={{ maxWidth: 320 }}
          styles={{ input: { fontVariantNumeric: 'tabular-nums' } }}
          rightSection={
            <Text component="span" size="sm" c="dimmed" pr="xs">
              px
            </Text>
          }
        />
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="xs">
          List card limits
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          These limits apply to every list on this board. When hard limit is on, new cards cannot be
          added past the limit; with soft limit, the server still allows adds (warn in UI later).
        </Text>
        <TextInput
          label="Max cards per list"
          description={`Whole number, ${LIST_MAX_CARDS_MIN.toLocaleString()}–${LIST_MAX_CARDS_MAX.toLocaleString()}. Saved with the button below.`}
          value={maxCardsDraft}
          onChange={(e) => {
            setMaxCardsDraft(e.currentTarget.value);
          }}
          inputMode="numeric"
          disabled={loading}
          mb="md"
          style={{ maxWidth: 320 }}
          styles={{ input: { fontVariantNumeric: 'tabular-nums' } }}
        />
        <Switch
          label={enforceMaxCards ? 'Hard limit' : 'Soft limit'}
          checked={enforceMaxCards}
          onChange={(e) => setEnforceMaxCards(e.currentTarget.checked)}
          disabled={loading}
          description={
            enforceMaxCards
              ? 'Hard limit: server blocks new cards when a list is full.'
              : 'Soft limit: server does not block adds (use for warnings only).'
          }
        />
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
