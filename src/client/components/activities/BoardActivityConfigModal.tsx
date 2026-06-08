import { useState } from 'react';
import { Box, Modal, Tabs } from '@mantine/core';
import { IconDeviceIpadHorizontalSearch, IconMail } from '@tabler/icons-react';
import type { BoardActivityTrackingSettings } from '../../../shared/constants/boardContentActivities.js';
import { BoardActivityTrackingCategoriesPanel } from './BoardActivityTrackingCategoriesPanel.js';
import { BoardActivityEmailRoundupPanel } from './BoardActivityEmailRoundupPanel.js';
import './boardActivityConfigModal.css';

export type ActivityConfigTab = 'tracking' | 'email-roundup';

interface BoardActivityConfigModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly boardId: string;
  readonly tracking: BoardActivityTrackingSettings;
  readonly canEdit: boolean;
  readonly logEnabled: boolean;
  readonly onTrackingSave: (tracking: BoardActivityTrackingSettings) => Promise<void>;
  readonly emailRoundupEnabled: boolean;
  readonly emailRoundupUserIds: readonly string[];
  readonly savingEmailRoundupEnabled: boolean;
  readonly sendingManualRoundup: boolean;
  readonly onEmailRoundupEnabledChange: (enabled: boolean) => Promise<void>;
  readonly onEmailRoundupUserIdsChange: (ids: readonly string[]) => Promise<void>;
  readonly onSendManualRoundup: () => Promise<void>;
}

export function BoardActivityConfigModal({
  opened,
  onClose,
  boardId,
  tracking,
  canEdit,
  logEnabled,
  onTrackingSave,
  emailRoundupEnabled,
  emailRoundupUserIds,
  savingEmailRoundupEnabled,
  sendingManualRoundup,
  onEmailRoundupEnabledChange,
  onEmailRoundupUserIdsChange,
  onSendManualRoundup,
}: BoardActivityConfigModalProps) {
  const [topTab, setTopTab] = useState<ActivityConfigTab>('tracking');

  const handleTrackingSave = async (next: BoardActivityTrackingSettings): Promise<void> => {
    await onTrackingSave(next);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Activity log configuration"
      centered
      yOffset={0}
      size="100%"
      classNames={{
        inner: 'board-activity-config-modal__inner',
        content: 'board-activity-config-modal__content',
        header: 'board-activity-config-modal__header',
        body: 'board-activity-config-modal__body',
      }}
    >
      <Box className="board-activity-config-modal__scroll">
        <Tabs
          value={topTab}
          onChange={(value: string | null) => {
            if (value === 'tracking' || value === 'email-roundup') {
              setTopTab(value);
            }
          }}
          keepMounted={false}
          classNames={{
            root: 'board-activity-config-modal__tabs',
            list: 'board-activity-config-modal__tabs-list',
          }}
        >
          <Tabs.List>
            <Tabs.Tab
              value="tracking"
              leftSection={<IconDeviceIpadHorizontalSearch size={18} stroke={1.5} />}
            >
              Tracking Categories
            </Tabs.Tab>
            <Tabs.Tab value="email-roundup" leftSection={<IconMail size={18} stroke={1.5} />}>
              Email Roundup
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel
            value="tracking"
            pt="md"
            className="board-activity-config-modal__tab-panel"
          >
            <BoardActivityTrackingCategoriesPanel
              tracking={tracking}
              canEdit={canEdit}
              logEnabled={logEnabled}
              onSave={handleTrackingSave}
              onCancel={onClose}
            />
          </Tabs.Panel>

          <Tabs.Panel
            value="email-roundup"
            pt="md"
            className="board-activity-config-modal__tab-panel board-activity-config-modal__tab-panel--fill"
          >
            <BoardActivityEmailRoundupPanel
              boardId={boardId}
              enabled={emailRoundupEnabled}
              recipientUserIds={emailRoundupUserIds}
              canEdit={canEdit}
              savingEnabled={savingEmailRoundupEnabled}
              sendingManualRoundup={sendingManualRoundup}
              onEnabledChange={onEmailRoundupEnabledChange}
              onRecipientIdsChange={onEmailRoundupUserIdsChange}
              onSendManualRoundup={onSendManualRoundup}
            />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Modal>
  );
}
