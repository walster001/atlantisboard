import { useMemo, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { api } from '../../../utils/api.js';
import { buildUniqueCustomRoleKey } from './roleKeyUtils.js';
import { parseHierarchyFromInput } from './permissionUtils.js';

export function CreateRoleModal(props: {
  readonly existingRoleKeys: readonly string[];
  readonly onClose: () => void;
  readonly onCreated: (createdRoleKey: string) => Promise<void>;
}) {
  const { existingRoleKeys, onClose, onCreated } = props;
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [hierarchyLevel, setHierarchyLevel] = useState<number>(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingKeySet = useMemo(() => new Set(existingRoleKeys), [existingRoleKeys]);
  const derivedKey = useMemo(
    () => buildUniqueCustomRoleKey(displayName, existingKeySet),
    [displayName, existingKeySet],
  );

  const submit = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const key = derivedKey;
      if (!key) {
        setError('Role name must be unique and valid (min 3 characters; letters/numbers).');
        return;
      }
      await api.createRole({
        key,
        displayName: displayName.trim(),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
        permissions: [],
        hierarchyLevel,
      });
      await onCreated(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Create custom role" centered>
      <Stack gap="sm">
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput
          label="Role name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="e.g. Board Editor"
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={2}
        />
        <TextInput
          label="Hierarchy number"
          value={String(hierarchyLevel)}
          inputMode="numeric"
          pattern="[0-9]*"
          onChange={(e) => {
            const next = parseHierarchyFromInput(e.currentTarget.value, 1000);
            setHierarchyLevel(next);
          }}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={loading} disabled={derivedKey === null}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
