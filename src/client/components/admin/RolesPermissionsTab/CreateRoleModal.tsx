import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { api } from '../../../utils/api.js';
import { buildUniqueCustomRoleKey } from './roleKeyUtils.js';
import { parseHierarchyFromInput } from './permissionUtils.js';

export function CreateRoleModal(props: {
  readonly existingRoleKeys: readonly string[];
  readonly defaultHierarchyLevel: number;
  readonly onClose: () => void;
  readonly onCreated: (createdRoleKey: string) => Promise<void>;
}) {
  const { existingRoleKeys, defaultHierarchyLevel, onClose, onCreated } = props;
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [hierarchyLevel, setHierarchyLevel] = useState<number>(defaultHierarchyLevel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

  const existingKeySet = useMemo(() => new Set(existingRoleKeys), [existingRoleKeys]);
  const derivedKey = useMemo(
    () => buildUniqueCustomRoleKey(displayName, existingKeySet),
    [displayName, existingKeySet],
  );

  const submit = async (): Promise<void> => {
    if (submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;
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
      const axiosMsg =
        e != null &&
        typeof e === 'object' &&
        'response' in e &&
        (e as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message;
      setError(
        typeof axiosMsg === 'string' && axiosMsg.length > 0
          ? axiosMsg
          : e instanceof Error
            ? e.message
            : 'Failed to create role',
      );
    } finally {
      submitInFlightRef.current = false;
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
