import { useState, useEffect } from 'react';
import { Modal, Select, Button, Stack, Group, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';

interface List {
  _id: string;
  name: string;
  boardId: string;
}

interface DuplicateCardModalProps {
  cardId: string;
  currentListId: string;
  boardId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DuplicateCardModal({
  cardId,
  currentListId,
  boardId,
  onClose,
  onSuccess,
}: DuplicateCardModalProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [targetListId, setTargetListId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchingLists, setFetchingLists] = useState(true);

  useEffect(() => {
    const loadLists = async () => {
      try {
        setFetchingLists(true);
        const response = await api.getListsByBoard(boardId);
        const boardLists = (response as { lists: List[] }).lists;
        setLists(boardLists);
        // Set default to current list if available
        if (currentListId && boardLists.find((l) => l._id === currentListId)) {
          setTargetListId(currentListId);
        } else if (boardLists.length > 0) {
          setTargetListId(boardLists[0]._id);
        }
      } catch (error) {
        console.error('Error loading lists:', error);
      } finally {
        setFetchingLists(false);
      }
    };

    loadLists();
  }, [boardId, currentListId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetListId) return;

    setLoading(true);
    try {
      await api.duplicateCard(cardId, targetListId);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error duplicating card:', error);
      notifications.show({
        color: 'red',
        title: 'Could not duplicate card',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Duplicate Card" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {fetchingLists ? (
            <Loader />
          ) : (
            <Select
              label="Target List"
              value={targetListId}
              onChange={(value) => setTargetListId(value || '')}
              data={lists.map((list) => ({ value: list._id, label: list.name }))}
              required
              disabled={loading}
              description="The card will be duplicated to the selected list with all its properties (labels, checklists, comments, assignees, due dates)"
            />
          )}

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
              disabled={loading || !targetListId || fetchingLists}
              loading={loading}
            >
              {loading ? 'Duplicating...' : 'Duplicate Card'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

