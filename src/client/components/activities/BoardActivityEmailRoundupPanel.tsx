import { Button, Group, Stack, Switch, Text } from '@mantine/core';
import { BoardActivityEmailRoundupRecipients } from './BoardActivityEmailRoundupRecipients.js';

interface BoardActivityEmailRoundupPanelProps {
  readonly boardId: string;
  readonly enabled: boolean;
  readonly recipientUserIds: readonly string[];
  readonly canEdit: boolean;
  readonly savingEnabled: boolean;
  readonly sendingManualRoundup: boolean;
  readonly onEnabledChange: (enabled: boolean) => Promise<void>;
  readonly onRecipientIdsChange: (ids: readonly string[]) => Promise<void>;
  readonly onSendManualRoundup: () => Promise<void>;
}

export function BoardActivityEmailRoundupPanel({
  boardId,
  enabled,
  recipientUserIds,
  canEdit,
  savingEnabled,
  sendingManualRoundup,
  onEnabledChange,
  onRecipientIdsChange,
  onSendManualRoundup,
}: BoardActivityEmailRoundupPanelProps) {
  const canSendManual = canEdit && recipientUserIds.length > 0;

  return (
    <Stack gap="md" className="board-activity-config-modal__panel board-activity-config-modal__panel--fill">
      <Stack gap={4} style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Switch
            label="Weekly email roundup"
            description="Send a weekly summary of board activity to selected recipients."
            checked={enabled}
            disabled={!canEdit || savingEnabled}
            withThumbIndicator={false}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(event) => {
              void onEnabledChange(event.currentTarget.checked);
            }}
          />
          <Button
            color="blue"
            size="sm"
            disabled={!canSendManual || sendingManualRoundup || savingEnabled}
            loading={sendingManualRoundup}
            style={{ flexShrink: 0 }}
            onClick={() => {
              void onSendManualRoundup();
            }}
          >
            Send Manual Roundup
          </Button>
        </Group>
        {!enabled ? (
          <Text size="sm" c="dimmed">
            Turn on the roundup to choose who receives the weekly email digest.
          </Text>
        ) : null}
      </Stack>
      {enabled ? (
        <BoardActivityEmailRoundupRecipients
          boardId={boardId}
          recipientUserIds={recipientUserIds}
          onRecipientIdsChange={onRecipientIdsChange}
          canEdit={canEdit}
        />
      ) : null}
    </Stack>
  );
}
