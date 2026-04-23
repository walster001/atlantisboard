import { useEffect, useState } from 'react';
import { Modal, Select, Button, Alert, Stack, Group, TextInput, ActionIcon, Tooltip } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { api } from '../../utils/api.js';

interface CreateInviteModalProps {
  workspaceId?: string;
  boardId?: string;
  type: 'workspace' | 'board';
  onClose: () => void;
  onSuccess: () => void;
}

const BUILTIN_INVITE_ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export function CreateInviteModal({
  workspaceId,
  boardId,
  type,
  onClose,
  onSuccess,
}: CreateInviteModalProps) {
  const [inviteType, setInviteType] = useState<'one-time' | 'recurring'>('one-time');
  const [roleKey, setRoleKey] = useState<string>('viewer');
  const [roleOptions, setRoleOptions] = useState<Array<{ value: string; label: string }>>([
    ...BUILTIN_INVITE_ROLE_OPTIONS,
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ token: string; inviteType: string } | null>(null);

  useEffect(() => {
    if (type === 'workspace' && workspaceId) {
      let cancelled = false;
      void api
        .getWorkspaceAssignableRoles(workspaceId)
        .then((r) => {
          if (cancelled) return;
          const roles = Array.isArray(r.roles) ? r.roles : [];
          const mapped = roles.map((role) => ({ value: role.key, label: role.displayName }));
          if (mapped.length > 0) {
            setRoleOptions(mapped);
            setRoleKey((current) =>
              mapped.some((o) => o.value === current) ? current : (mapped[0]?.value ?? 'viewer'),
            );
          } else {
            setRoleOptions([...BUILTIN_INVITE_ROLE_OPTIONS]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRoleOptions([...BUILTIN_INVITE_ROLE_OPTIONS]);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    if (type === 'board' && boardId) {
      let cancelled = false;
      void api
        .getBoardAssignableRoles(boardId)
        .then((r) => {
          if (cancelled) return;
          const roles = Array.isArray(r.roles) ? r.roles : [];
          const mapped = roles.map((role) => ({ value: role.key, label: role.displayName }));
          if (mapped.length > 0) {
            setRoleOptions(mapped);
            setRoleKey((current) =>
              mapped.some((o) => o.value === current) ? current : (mapped[0]?.value ?? 'viewer'),
            );
          } else {
            setRoleOptions([...BUILTIN_INVITE_ROLE_OPTIONS]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRoleOptions([...BUILTIN_INVITE_ROLE_OPTIONS]);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    setRoleOptions([...BUILTIN_INVITE_ROLE_OPTIONS]);
    return undefined;
  }, [type, workspaceId, boardId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (type === 'workspace' && !workspaceId) {
      setError('Workspace ID is required');
      return;
    }
    if (type === 'board' && !boardId) {
      setError('Board ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const inviteData: {
        workspaceId?: string;
        boardId?: string;
        type: 'workspace' | 'board';
        inviteType: 'one-time' | 'recurring';
        role?: 'admin' | 'manager' | 'viewer';
        roleKey?: string;
      } = {
        type,
        inviteType,
        ...(roleKey !== '' ? { roleKey } : { role: 'viewer' }),
      };
      if (workspaceId) {
        inviteData.workspaceId = workspaceId;
      }
      if (boardId) {
        inviteData.boardId = boardId;
      }
      const response = await api.createInvite(inviteData);
      setCreatedInvite({
        token: (response.inviteLink as { token: string }).token,
        inviteType,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = createdInvite
    ? `${window.location.origin}/invite/${createdInvite.token}`
    : '';

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Create ${type === 'workspace' ? 'Workspace' : 'Board'} Invite`}
      centered
    >
      <Stack gap="md">
        {error && (
          <Alert color="red">
            {error}
          </Alert>
        )}

        {createdInvite ? (
          <>
            <Alert color="green">
              Invite link created successfully!
            </Alert>
            <TextInput
              label="Invite Link"
              value={inviteUrl}
              readOnly
              rightSection={
                <Tooltip label="Copy to clipboard">
                  <ActionIcon
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                    }}
                  >
                    <IconCopy size={16} />
                  </ActionIcon>
                </Tooltip>
              }
            />
            <Group justify="flex-end" mt="md">
              <Button color="blue" onClick={onClose}>
                Close
              </Button>
            </Group>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Select
                label="Invite Type"
                value={inviteType}
                onChange={(value) => setInviteType((value || 'one-time') as 'one-time' | 'recurring')}
                data={[
                  { value: 'one-time', label: 'One-time (expires after 1 day)' },
                  { value: 'recurring', label: 'Recurring (no expiry)' },
                ]}
                disabled={loading}
                style={{ width: '100%', minWidth: 200, maxWidth: '100%' }}
              />

              <Select
                label="Default Role"
                value={roleKey}
                onChange={(value) => setRoleKey(value || 'viewer')}
                data={roleOptions}
                disabled={loading}
                style={{ width: '100%', minWidth: 220, maxWidth: '100%' }}
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
                  Create Invite
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  );
}

