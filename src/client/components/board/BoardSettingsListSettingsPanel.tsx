import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
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
      setEnforceMaxCards(enforce);
      const w = getBoardListColumnWidthPx(row);
      setListColumnWidthPx(w);
      setWidthDraft(String(w));
    }
  }, [boardId]);

  useEffect(() => {
    void refreshBoard();
  }, [refreshBoard]);

  const handleApplyListColumnWidth = useCallback((): void => {
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
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n)) {
      setWidthDraft(String(listColumnWidthPx));
      return;
    }
    const clamped = clampListColumnWidthPx(n);
    setListColumnWidthPx(clamped);
    setWidthDraft(String(clamped));
    if (clamped !== n) {
      notifications.show({
        title: 'Width adjusted',
        message: `Clamped to ${BOARD_LIST_COLUMN_WIDTH_MIN_PX}–${BOARD_LIST_COLUMN_WIDTH_MAX_PX}px.`,
        color: 'blue',
      });
    }
    onSettingsLivePatch?.({
      listColumnWidthAuto: true,
      listColumnWidthPx: clamped,
    });
  }, [widthDraft, listColumnWidthPx, onSettingsLivePatch]);

  const handleSave = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.updateBoard(boardId, {
        settings: {
          listMaxCards: maxCards,
          listEnforceMaxCards: enforceMaxCards,
          listColumnWidthAuto: true,
          listColumnWidthPx,
        },
      });
      const next = transformBoard((response as { board: unknown }).board);
      await db.boards.put(next);
      setBoard(next);
      const w = getBoardListColumnWidthPx(next);
      setListColumnWidthPx(w);
      setWidthDraft(String(w));
      onSettingsLivePatch?.({
        listMaxCards: maxCards,
        listEnforceMaxCards: enforceMaxCards,
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
        <Group align="flex-end" wrap="nowrap" gap="xs">
          <TextInput
            label="Default column width"
            description={`Used on wide screens; columns narrow automatically on smaller viewports (${BOARD_LIST_COLUMN_WIDTH_MIN_PX}–${BOARD_LIST_COLUMN_WIDTH_MAX_PX}).`}
            value={widthDraft}
            onChange={(e) => {
              setWidthDraft(e.currentTarget.value);
            }}
            inputMode="numeric"
            disabled={loading}
            style={{ flex: '1 1 220px' }}
            styles={{ input: { fontVariantNumeric: 'tabular-nums' } }}
          />
          <Text component="span" size="sm" c="dimmed" pb={4} style={{ flexShrink: 0 }}>
            px
          </Text>
          <Button
            variant="light"
            onClick={() => {
              handleApplyListColumnWidth();
            }}
            disabled={loading}
            style={{ flexShrink: 0 }}
          >
            Apply
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Click Apply to update the board column width on this device. Use Save below to persist all list
          settings to the server.
        </Text>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="xs">
          List card limits
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          These limits apply to every list on this board. When hard limit is on, new cards cannot be
          added past the limit; with soft limit, the server still allows adds (warn in UI later).
        </Text>
        <NumberInput
          label="Max cards per list"
          value={maxCards}
          onChange={(v) => setMaxCards(typeof v === 'number' ? v : DEFAULT_BOARD_LIST_MAX_CARDS)}
          min={1}
          max={100000}
          disabled={loading}
          mb="md"
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
