import { memo, useState, useRef, useEffect } from 'react';
import { Box, Button, Group, Stack, TextInput } from '@mantine/core';
import { api } from '../../utils/api.js';
import './boardView.css';

export interface BoardInlineListComposerProps {
  readonly boardId: string;
  readonly getNextPosition: () => number;
  readonly onListCreated: (response?: { list: unknown }) => void;
  readonly onCancel: () => void;
}

/**
 * Holds list name / loading / error locally so keystrokes do not re-render every
 * board column and card.
 */
function BoardInlineListComposerInner({
  boardId,
  getNextPosition,
  onListCreated,
  onCancel,
}: BoardInlineListComposerProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('List name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.createList({
        boardId,
        name: trimmed,
        position: getNextPosition(),
      });
      onListCreated(response);
      setName('');
      setFocusNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusNonce]);

  return (
    <Box className="board-inline-composer board-inline-composer--kanban">
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
            placeholder="Enter list title…"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={loading}
            size="sm"
            error={error}
            aria-invalid={error != null}
          />
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

export const BoardInlineListComposer = memo(BoardInlineListComposerInner);
BoardInlineListComposer.displayName = 'BoardInlineListComposer';
