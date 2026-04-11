import { useState } from 'react';
import { Modal, TextInput, Textarea, Button, Alert, Stack, Group } from '@mantine/core';
import { api } from '../../utils/api.js';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateWorkspaceModal({ onClose, onSuccess }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const workspaceData: { name: string; description?: string } = {
        name: name.trim(),
      };
      const trimmedDesc = description.trim();
      if (trimmedDesc) {
        workspaceData.description = trimmedDesc;
      }
      await api.createWorkspace(workspaceData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Create New Workspace" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && (
            <Alert color="red">
              {error}
            </Alert>
          )}

          <TextInput
            label="Workspace Name"
            placeholder="Enter workspace name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
            disabled={loading}
            required
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Enter workspace description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={loading}
            rows={3}
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
            >
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
