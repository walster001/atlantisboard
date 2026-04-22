import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Alert, Stack, TextInput, Group, Badge, Text, Loader, Box } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCopy } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import { subscribeSocketInvitesChanged } from '../../utils/socketRealtimeBridge.js';

interface InviteLink {
  _id: string;
  token: string;
  type: 'workspace' | 'board';
  inviteType: 'one-time' | 'recurring';
  roleKey: string;
  expiresAt?: string;
  usedCount: number;
  createdAt: string;
}

interface InviteListProps {
  workspaceId?: string;
  boardId?: string;
}

export function InviteList({ workspaceId, boardId }: InviteListProps) {
  const [invites, setInvites] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getInvites(workspaceId, boardId);
      setInvites((response.inviteLinks as InviteLink[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, boardId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    return subscribeSocketInvitesChanged((p) => {
      const wsMatch = workspaceId !== undefined && p.workspaceId === workspaceId;
      const bMatch = boardId !== undefined && p.boardId === boardId;
      if (!wsMatch && !bMatch) {
        return;
      }
      void loadInvites();
    });
  }, [workspaceId, boardId, loadInvites]);

  const handleDelete = (inviteId: string) => {
    modals.openConfirmModal({
      title: 'Delete invite',
      children: <Text size="sm">Are you sure you want to delete this invite?</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.deleteInvite(inviteId);
          loadInvites();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete invite');
        }
      },
    });
  };

  if (loading) {
    return (
      <Box ta="center" py="md">
        <Loader size="sm" />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert color="red">
        {error}
      </Alert>
    );
  }

  if (invites.length === 0) {
    return (
      <Text ta="center" py="md" c="dimmed">
        No invite links created yet
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      {invites.map((invite) => {
        const inviteUrl = `${window.location.origin}/invite/${invite.token}`;
        const isExpired =
          invite.inviteType === 'one-time' &&
          invite.expiresAt &&
          new Date(invite.expiresAt) < new Date();
        const isUsed = invite.inviteType === 'one-time' && invite.usedCount > 0;

        return (
          <Card
            key={invite._id}
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}
          >
            <Group justify="space-between" align="flex-start">
              <Stack gap="xs" style={{ flex: 1 }}>
                <Group gap="xs">
                  <Badge size="sm">
                    {invite.type === 'workspace' ? 'Workspace' : 'Board'}
                  </Badge>
                  <Badge size="sm" variant="outline">
                    {invite.inviteType === 'one-time' ? 'One-time' : 'Recurring'}
                  </Badge>
                  <Badge size="sm" color="gray">
                    {invite.roleKey}
                  </Badge>
                  {isExpired && <Badge size="sm" color="red">Expired</Badge>}
                  {isUsed && <Badge size="sm" color="yellow">Used</Badge>}
                </Group>
                <Group gap="xs">
                  <TextInput
                    size="xs"
                    value={inviteUrl}
                    readOnly
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    leftSection={<IconCopy size={14} />}
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                    }}
                  >
                    Copy
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  Created: {new Date(invite.createdAt).toLocaleDateString()}
                  {invite.inviteType === 'recurring' && invite.usedCount > 0 && (
                    <span> • Used {invite.usedCount} time(s)</span>
                  )}
                </Text>
              </Stack>
              {invite.inviteType === 'recurring' && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleDelete(invite._id)}
                >
                  Delete
                </Button>
              )}
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

