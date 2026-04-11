import { useState, useEffect } from 'react';
import { Modal, TextInput, Textarea, Button, Alert, Stack, Group, Text, Title, Card, Badge, Checkbox, Loader, Box, ScrollArea } from '@mantine/core';
import { api } from '../../utils/api.js';

interface PermissionSet {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
  createdAt: string;
}

export function PermissionSetsTab() {
  const [permissionSets, setPermissionSets] = useState<PermissionSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadPermissionSets();
  }, []);

  const loadPermissionSets = async () => {
    setLoading(true);
    setError(null);
    try {
      // Note: This assumes an API endpoint exists for getting permission sets
      // If not, this will need to be implemented on the backend
      const response = await api.getPermissionSets();
      setPermissionSets((response.permissionSets as PermissionSet[]) || []);
    } catch (err) {
      console.error('Error loading permission sets:', err);
      // Silently fail for now if endpoint doesn't exist
      setPermissionSets([]);
    } finally {
      setLoading(false);
    }
  };

  // Common permission strings that should be available
  const availablePermissions = [
    'boards.user.view',
    'boards.user.create',
    'boards.user.edit',
    'boards.user.delete',
    'cards.user.view',
    'cards.user.create',
    'cards.user.edit',
    'cards.user.delete',
    'lists.user.view',
    'lists.user.create',
    'lists.user.edit',
    'lists.user.delete',
    'comments.user.create',
    'comments.user.edit',
    'comments.user.delete',
    'admin.modifyrole',
    'admin.viewpermission.roles',
    'admin.manage.workspace',
    'admin.manage.board',
  ];

  if (loading) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Custom Permission Sets</Title>
        <Button color="blue" onClick={() => setShowCreate(true)}>
          Create Permission Set
        </Button>
      </Group>

      {error && (
        <Alert color="red">
          {error}
        </Alert>
      )}

      {permissionSets.length === 0 ? (
        <Box style={{ textAlign: 'center', padding: '2rem' }}>
          <Text c="dimmed">No custom permission sets created yet</Text>
        </Box>
      ) : (
        <Stack gap="md">
          {permissionSets.map((set) => (
            <Card key={set._id} shadow="sm" style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}>
              <Stack gap="md">
                <Title order={4}>{set.name}</Title>
                {set.description && (
                  <Text size="sm" c="dimmed">{set.description}</Text>
                )}
                <Box>
                  <Text size="sm" fw={600} mb="xs">Permissions:</Text>
                  <Group gap="xs">
                    {set.permissions.map((perm) => (
                      <Badge key={perm} size="sm">
                        {perm}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {showCreate && (
        <CreatePermissionSetModal
          availablePermissions={availablePermissions}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            loadPermissionSets();
          }}
        />
      )}
    </Stack>
  );
}

interface CreatePermissionSetModalProps {
  availablePermissions: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePermissionSetModal({
  availablePermissions,
  onClose,
  onSuccess,
}: CreatePermissionSetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePermission = (perm: string) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(perm)) {
        newSet.delete(perm);
      } else {
        newSet.add(perm);
      }
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const permissionSetData: {
        name: string;
        description?: string;
        permissions: string[];
      } = {
        name: name.trim(),
        permissions: Array.from(selectedPermissions),
      };
      if (description.trim()) {
        permissionSetData.description = description.trim();
      }
      await api.createPermissionSet(permissionSetData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create permission set');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title="Create Permission Set"
      size="xl"
      centered
    >
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
            disabled={loading}
            required
          />

          <Textarea
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={loading}
            rows={2}
          />

          <Box>
            <Text size="sm" fw={500} mb="xs">Permissions</Text>
            <ScrollArea h={384}>
              <Stack gap="xs" p="xs">
                {availablePermissions.map((perm) => (
                  <Checkbox
                    key={perm}
                    label={perm}
                    checked={selectedPermissions.has(perm)}
                    onChange={() => togglePermission(perm)}
                    disabled={loading}
                  />
                ))}
              </Stack>
            </ScrollArea>
          </Box>

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
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

