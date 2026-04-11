import { useState, useCallback } from 'react';
import { Modal, Button, Stack, Group, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CreateInviteModal } from '../invites/CreateInviteModal.js';
import { InviteList } from '../invites/InviteList.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';

interface BoardInvitesModalProps {
  boardId: string;
  onClose: () => void;
}

export function BoardInvitesModal({ boardId, onClose }: BoardInvitesModalProps) {
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [inviteListKey, setInviteListKey] = useState(0);
  const { can } = useBoardPermissions(boardId);

  const handleInviteCreated = useCallback(() => {
    setInviteListKey((k) => k + 1);
  }, []);

  const handleCopyBoardPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notifications.show({
        title: 'Link copied',
        message: 'Board page URL copied to clipboard.',
        color: 'blue',
      });
    } catch {
      notifications.show({
        title: 'Could not copy',
        message: 'Clipboard access was denied.',
        color: 'red',
      });
    }
  };

  return (
    <>
      <Modal
        opened={true}
        onClose={onClose}
        title={<Title order={3}>Board invites</Title>}
        centered
        size="lg"
        styles={{
          body: { maxHeight: 'min(70vh, 560px)', overflowY: 'auto' },
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={600}>Invite links</Text>
            <Button
              size="sm"
              color="blue"
              onClick={() => setShowCreateInvite(true)}
              disabled={!can('invites.create')}
            >
              Create invite
            </Button>
          </Group>
          <InviteList key={inviteListKey} boardId={boardId} />
          <Group justify="space-between" align="center" mt="md" wrap="wrap">
            <Button variant="subtle" size="sm" onClick={() => void handleCopyBoardPageLink()}>
              Copy board page link
            </Button>
            <Button onClick={onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      {showCreateInvite ? (
        <CreateInviteModal
          boardId={boardId}
          type="board"
          onClose={() => setShowCreateInvite(false)}
          onSuccess={handleInviteCreated}
        />
      ) : null}
    </>
  );
}
