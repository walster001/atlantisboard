import { useState, useEffect, type FormEvent } from 'react';
import {
  Modal,
  TextInput,
  Button,
  Alert,
  Stack,
  Group,
  Text,
  Loader,
  ActionIcon,
  Box,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconEdit } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import { BOARD_PRESET_COLOURS, normalizePresetHex } from '../../constants/boardPresetColors.js';
import { BoardColourPickerPanel } from './BoardColourPickerPanel.js';
import { subscribeSocketBoardLabelsChanged } from '../../utils/socketRealtimeBridge.js';

interface Label {
  _id: string;
  name: string;
  color: string;
  isPredefined?: boolean;
}

interface LabelManagementProps {
  boardId: string;
  /** Rich header + rows styled like board settings reference */
  layout?: 'default' | 'settings';
}

export function LabelManagement({ boardId, layout = 'default' }: LabelManagementProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);

  useEffect(() => {
    loadLabels();
  }, [boardId]);

  useEffect(() => {
    return subscribeSocketBoardLabelsChanged(({ boardId: changedId }) => {
      if (changedId !== boardId) {
        return;
      }
      void loadLabels();
    });
  }, [boardId]);

  const loadLabels = async () => {
    try {
      setLoading(true);
      const response = await api.getBoardLabels(boardId);
      setLabels((response as { labels: Label[] }).labels);
    } catch (error) {
      console.error('Error loading labels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (labelId: string) => {
    modals.openConfirmModal({
      title: 'Delete label',
      children: (
        <Text size="sm">Delete this label? It will be removed from all cards.</Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.deleteLabel(boardId, labelId);
          await loadLabels();
        } catch (error) {
          console.error('Error deleting label:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete label',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    });
  };

  if (loading) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
        <Loader />
      </Box>
    );
  }

  const rowSurface =
    layout === 'settings'
      ? {
          backgroundColor: '#fff',
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
        }
      : {
          backgroundColor: 'var(--mantine-color-gray-1)',
          borderRadius: 'var(--mantine-radius-md)',
        };

  return (
    <Stack gap="md">
      {layout === 'settings' ? (
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="lg">
              Board Labels
            </Text>
            <Text size="sm" c="dimmed">
              Create and manage labels that can be applied to cards on this board.
            </Text>
          </Stack>
          <Button
            size="sm"
            color="blue"
            onClick={() => {
              setEditingLabel(null);
              setShowCreateModal(true);
            }}
          >
            + Add Label
          </Button>
        </Group>
      ) : (
        <Group justify="space-between" align="center">
          <Text fw={600}>Board Labels</Text>
          <Button
            size="sm"
            color="blue"
            onClick={() => {
              setEditingLabel(null);
              setShowCreateModal(true);
            }}
          >
            Create Label
          </Button>
        </Group>
      )}

      {labels.length === 0 ? (
        <Text size="sm" c="dimmed">No labels created yet</Text>
      ) : (
        <Stack gap="xs">
          {labels.map((label) => (
            <Group
              key={label._id}
              gap="md"
              p="md"
              style={rowSurface}
            >
              <Box
                w={32}
                h={32}
                style={{
                  backgroundColor: label.color,
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              />
              <Box style={{ flex: 1 }}>
                <Text fw={500}>{label.name}</Text>
                {layout === 'default' ? (
                  <Text size="xs" c="dimmed">{label.color}</Text>
                ) : null}
              </Box>
              <Group gap={layout === 'settings' ? 'sm' : 'xs'}>
                <ActionIcon
                  size={layout === 'settings' ? 'lg' : 'sm'}
                  variant="subtle"
                  onClick={() => {
                    setEditingLabel(label);
                    setShowCreateModal(true);
                  }}
                  aria-label="Edit label"
                >
                  <IconEdit size={layout === 'settings' ? 20 : 14} />
                </ActionIcon>
                <ActionIcon
                  size={layout === 'settings' ? 'lg' : 'sm'}
                  variant="subtle"
                  color="red"
                  onClick={() => handleDelete(label._id)}
                  aria-label="Delete label"
                >
                  <IconTrash size={layout === 'settings' ? 20 : 14} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {showCreateModal && (
        <LabelEditModal
          boardId={boardId}
          label={editingLabel}
          onClose={() => {
            setShowCreateModal(false);
            setEditingLabel(null);
          }}
          onSave={() => {
            loadLabels();
            setShowCreateModal(false);
            setEditingLabel(null);
          }}
        />
      )}
    </Stack>
  );
}

interface LabelEditModalProps {
  boardId: string;
  label?: Label | null;
  onClose: () => void;
  onSave: () => void;
}

function LabelEditModal({ boardId, label, onClose, onSave }: LabelEditModalProps) {
  const defaultColor = BOARD_PRESET_COLOURS[0] ?? '#0079BF';
  const [name, setName] = useState(label?.name ?? '');
  const [selectedColor, setSelectedColor] = useState(() =>
    normalizePresetHex(label?.color ?? defaultColor, BOARD_PRESET_COLOURS),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(label?.name ?? '');
    setSelectedColor(normalizePresetHex(label?.color ?? defaultColor, BOARD_PRESET_COLOURS));
  }, [label, defaultColor]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!name.trim()) {
        setError('Label name is required');
        return;
      }
      if (!selectedColor.trim()) {
        setError('Label color is required');
        return;
      }

      if (label) {
        await api.updateLabel(boardId, label._id, {
          name: name.trim(),
          color: selectedColor.trim(),
        });
      } else {
        await api.createLabel(boardId, {
          name: name.trim(),
          color: selectedColor.trim(),
        });
      }

      onSave();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save label');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={label ? 'Edit Label' : 'Create Label'}
      centered
      size="lg"
    >
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Label Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter label name"
            required
            disabled={loading}
          />

          <BoardColourPickerPanel
            value={selectedColor}
            onChange={setSelectedColor}
            disabled={loading}
          />

          <Group justify="flex-end" gap="xs" mt="md">
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
              disabled={loading}
              loading={loading}
            >
              {label ? 'Update' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

