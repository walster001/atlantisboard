import { useState, useEffect } from 'react';
import { Stack, Text, Title, Button, Alert, Card, Badge, Group, Loader, Box } from '@mantine/core';
import { modals } from '@mantine/modals';
import { api } from '../../utils/api.js';

interface PlaceholderUser {
  _id: string;
  email: string;
  displayName: string;
  placeholderName?: string;
  placeholderEmail?: string;
  placeholderSource?: 'trello' | 'wekan';
  isPlaceholder: boolean;
}

export function PlaceholderUsersTab() {
  const [placeholderUsers, setPlaceholderUsers] = useState<PlaceholderUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlaceholderUsers();
  }, []);

  const loadPlaceholderUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getPlaceholderUsers();
      setPlaceholderUsers((response.users as PlaceholderUser[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load placeholder users');
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = (userId: string) => {
    modals.openConfirmModal({
      title: 'Convert placeholder user',
      children: (
        <Text size="sm">Convert this placeholder user to a real user?</Text>
      ),
      labels: { confirm: 'Convert', cancel: 'Cancel' },
      onConfirm: async () => {
        try {
          await api.convertPlaceholderUser(userId);
          loadPlaceholderUsers();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to convert user');
        }
      },
    });
  };


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
        <Title order={2}>Placeholder Users</Title>
      </Group>

      {error && (
        <Alert color="red">
          {error}
        </Alert>
      )}

      {placeholderUsers.length === 0 ? (
        <Box style={{ textAlign: 'center', padding: '2rem' }}>
          <Text c="dimmed">No placeholder users found</Text>
        </Box>
      ) : (
        <Stack gap="xs">
          {placeholderUsers.map((user) => (
            <Card
              key={user._id}
              shadow="sm"
              style={{
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: '1px solid var(--mantine-color-gray-3)',
              }}
            >
              <Group justify="space-between" align="center">
                <Group gap="md">
                  <Badge color="yellow">Placeholder</Badge>
                  <Box>
                    <Text fw={600}>
                      {user.placeholderName || user.displayName}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Source: {user.placeholderSource || 'unknown'}
                    </Text>
                  </Box>
                </Group>
                <Group gap="xs">
                  <Button
                    size="sm"
                    color="blue"
                    onClick={() => handleConvert(user._id)}
                  >
                    Convert
                  </Button>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

