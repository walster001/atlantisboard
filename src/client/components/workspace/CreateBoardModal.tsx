import { useState, type FormEvent } from 'react';
import { Modal, TextInput, Textarea, Button, Alert, Stack, Group, Text } from '@mantine/core';
import { BOARD_DESCRIPTION_MAX_LENGTH, BOARD_NAME_MAX_LENGTH } from '../../constants/boardFieldLimits.js';
import { api } from '../../utils/api.js';

interface CreateBoardModalProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateBoardModal({ workspaceId, onClose, onSuccess }: CreateBoardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOverLimit = name.length > BOARD_NAME_MAX_LENGTH;
  const descriptionOverLimit = description.length > BOARD_DESCRIPTION_MAX_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    if (nameOverLimit) {
      setError(`Board name cannot exceed ${BOARD_NAME_MAX_LENGTH} characters`);
      return;
    }
    if (descriptionOverLimit) {
      setError(`Description cannot exceed ${BOARD_DESCRIPTION_MAX_LENGTH} characters`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const boardData: {
        workspaceId: string;
        name: string;
        description?: string;
      } = {
        workspaceId,
        name: name.trim(),
      };
      if (description.trim()) {
        boardData.description = description.trim();
      }
      await api.createBoard(boardData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Create New Board" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && (
            <Alert color="red">
              {error}
            </Alert>
          )}

          <TextInput
            label="Board Name"
            placeholder="Enter board name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
            disabled={loading}
            required
            error={nameOverLimit ? `Cannot exceed ${BOARD_NAME_MAX_LENGTH} characters` : undefined}
            description={
              <Text component="span" size="xs" c={nameOverLimit ? 'red' : 'dimmed'}>
                {name.length}/{BOARD_NAME_MAX_LENGTH}
                {nameOverLimit ? ' — over limit' : ''}
              </Text>
            }
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Enter board description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={loading}
            rows={3}
            error={descriptionOverLimit ? `Cannot exceed ${BOARD_DESCRIPTION_MAX_LENGTH} characters` : undefined}
            description={
              <Text component="span" size="xs" c={descriptionOverLimit ? 'red' : 'dimmed'}>
                {description.length}/{BOARD_DESCRIPTION_MAX_LENGTH}
                {descriptionOverLimit ? ' — over limit' : ''}
              </Text>
            }
          />

          <Group justify="flex-end" mt="md">
            <Button
              type="button"
              variant="subtle"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              loading={loading}
              disabled={nameOverLimit || descriptionOverLimit}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
