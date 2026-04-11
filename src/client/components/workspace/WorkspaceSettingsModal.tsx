import { useState } from 'react';
import { Modal, Tabs, Button, Stack, Group, Text } from '@mantine/core';
import { InviteList } from '../invites/InviteList.js';
import { CreateInviteModal } from '../invites/CreateInviteModal.js';
import { WorkspaceMemberManagement } from './WorkspaceMemberManagement.js';
import './workspaceSettingsModal.css';

interface WorkspaceSettingsModalProps {
  workspaceId: string;
  onClose: () => void;
}

export function WorkspaceSettingsModal({ workspaceId, onClose }: WorkspaceSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'invites'>('members');
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [inviteListNonce, setInviteListNonce] = useState(0);

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title="Workspace Settings"
      centered
      yOffset={0}
      size="100%"
      closeOnClickOutside={false}
      classNames={{
        inner: 'workspace-settings-modal__inner',
        content: 'workspace-settings-modal__content',
        header: 'workspace-settings-modal__header',
        body: 'workspace-settings-modal__body',
      }}
    >
      <Stack className="workspace-settings-modal__scroll" gap="md" style={{ flex: 1, minHeight: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab((value || 'members') as typeof activeTab)}
          keepMounted={false}
          classNames={{
            root: 'workspace-settings-modal__tabs',
            list: 'workspace-settings-modal__tabs-list',
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="members">Members</Tabs.Tab>
            <Tabs.Tab value="invites">Invites</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel
            value="members"
            pt="md"
            className="workspace-settings-modal__tab-panel workspace-settings-modal__tab-panel--fill"
          >
            <div className="workspace-settings-modal__panel-inner">
              <WorkspaceMemberManagement workspaceId={workspaceId} />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="invites" pt="md" className="workspace-settings-modal__tab-panel">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text fw={600}>Workspace Invites</Text>
                <Button size="sm" color="blue" onClick={() => setShowCreateInvite(true)}>
                  Create Invite
                </Button>
              </Group>
              <InviteList key={`${workspaceId}:${inviteListNonce}`} workspaceId={workspaceId} />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {showCreateInvite && (
        <CreateInviteModal
          workspaceId={workspaceId}
          type="workspace"
          onClose={() => setShowCreateInvite(false)}
          onSuccess={() => {
            setShowCreateInvite(false);
            setInviteListNonce((n) => n + 1);
          }}
        />
      )}
    </Modal>
  );
}
