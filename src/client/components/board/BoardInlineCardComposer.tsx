import { memo, useState, useRef, useEffect } from 'react';
import { Box, Button, Group, Stack, TextInput, Text } from '@mantine/core';
import { db, type CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { transformCard } from '../../utils/transform.js';
import { CARD_TITLE_MAX_LENGTH } from '../../constants/cardFieldLimits.js';
import './boardView.css';

export interface BoardInlineCardComposerProps {
  readonly listId: string;
  readonly boardId: string;
  /** Insert position for the new card (typically current list length). */
  readonly position: number;
  readonly onCreated: (card: CardDB) => void;
  readonly onCancel: () => void;
}

/**
 * Holds title/loading/error locally so typing does not re-render the parent column
 * (and every card in the list).
 */
function BoardInlineCardComposerInner({
  listId,
  boardId,
  position,
  onCreated,
  onCancel,
}: BoardInlineCardComposerProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Card title is required');
      return;
    }
    if (trimmed.length > CARD_TITLE_MAX_LENGTH) {
      setError(`Title cannot exceed ${CARD_TITLE_MAX_LENGTH} characters`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { card } = await api.createCard({
        listId,
        boardId,
        title: trimmed,
        position,
      });
      const cardDb = transformCard(card);
      onCreated(cardDb);
      await db.cards.put(cardDb);
      setTitle('');
      setFocusNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    } finally {
      setLoading(false);
    }
  };

  // useEffect (not useLayoutEffect): focus does not need to run before paint; layout effect
  // after a large parent commit worsens main-thread work and shows up as slow scheduler tasks.
  useEffect(() => {
    inputRef.current?.focus();
  }, [focusNonce]);

  return (
    <Box className="board-inline-composer board-inline-composer--column mt-xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Stack gap="xs">
          <TextInput
            ref={inputRef}
            placeholder="Enter a title for this card…"
            value={title}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={loading}
            size="sm"
            maxLength={CARD_TITLE_MAX_LENGTH}
            error={error}
            aria-invalid={error != null}
          />
          <Text size="xs" c="dimmed">
            {title.length}/{CARD_TITLE_MAX_LENGTH}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button type="submit" size="sm" color="blue" loading={loading}>
              Create
            </Button>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              color="gray"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </Box>
  );
}

export const BoardInlineCardComposer = memo(BoardInlineCardComposerInner);
BoardInlineCardComposer.displayName = 'BoardInlineCardComposer';
