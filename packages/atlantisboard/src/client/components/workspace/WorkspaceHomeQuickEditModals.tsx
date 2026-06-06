import { useState } from 'react';
import { Button, Group, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';

export interface WorkspaceRenameTarget {
  readonly id: string;
  readonly initialName: string;
}

export interface WorkspaceDescriptionTarget {
  readonly id: string;
  readonly initialDescription: string;
}

interface RenameWorkspaceModalProps {
  readonly target: WorkspaceRenameTarget | null;
  readonly onClose: () => void;
  readonly onSuccess: () => void | Promise<void>;
}

/** Draft state lives here so HomePage does not re-render the full workspace list on every keystroke. */
export function RenameWorkspaceModal({ target, onClose, onSuccess }: RenameWorkspaceModalProps) {
  const [name, setName] = useState(() => target?.initialName ?? '');
  const [saving, setSaving] = useState(false);

  const opened = target !== null;

  return (
    <Modal opened={opened} onClose={onClose} title="Rename workspace" centered closeOnClickOutside={false}>
      <Stack gap="md">
        <TextInput
          label="Workspace name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Workspace name"
          required
          disabled={saving}
          data-autofocus
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="blue"
            loading={saving}
            onClick={async () => {
              if (target === null) return;
              const trimmed = name.trim();
              if (!trimmed) return;
              setSaving(true);
              try {
                await api.updateWorkspace(target.id, { name: trimmed });
                await Promise.resolve(onSuccess());
                onClose();
                notifications.show({
                  title: 'Workspace renamed',
                  message: 'Workspace name has been updated.',
                  color: 'green',
                });
              } catch (error) {
                console.error('Error renaming workspace:', error);
                notifications.show({
                  title: 'Error',
                  message: 'Failed to rename workspace.',
                  color: 'red',
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface EditWorkspaceDescriptionModalProps {
  readonly target: WorkspaceDescriptionTarget | null;
  readonly onClose: () => void;
  readonly onSuccess: () => void | Promise<void>;
}

export function EditWorkspaceDescriptionModal({
  target,
  onClose,
  onSuccess,
}: EditWorkspaceDescriptionModalProps) {
  const [description, setDescription] = useState(() => target?.initialDescription ?? '');
  const [saving, setSaving] = useState(false);

  const opened = target !== null;

  return (
    <Modal opened={opened} onClose={onClose} title="Edit description" centered closeOnClickOutside={false}>
      <Stack gap="md">
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="Workspace description"
          rows={4}
          disabled={saving}
          data-autofocus
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="blue"
            loading={saving}
            onClick={async () => {
              if (target === null) return;
              setSaving(true);
              try {
                await api.updateWorkspace(target.id, {
                  description: description.trim(),
                });
                await Promise.resolve(onSuccess());
                onClose();
                notifications.show({
                  title: 'Description updated',
                  message: 'Workspace description has been saved.',
                  color: 'green',
                });
              } catch (error) {
                console.error('Error updating workspace description:', error);
                notifications.show({
                  title: 'Error',
                  message: 'Failed to save description.',
                  color: 'red',
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
