import { useEffect, useState } from 'react';
import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import {
  BOARD_ACTIVITY_TRACKING_CATEGORIES,
  type BoardActivityTrackingSettings,
} from '../../../shared/constants/boardContentActivities.js';

interface BoardActivityTrackingModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly tracking: BoardActivityTrackingSettings;
  readonly canEdit: boolean;
  readonly logEnabled: boolean;
  readonly onSave: (tracking: BoardActivityTrackingSettings) => Promise<void>;
}

export function BoardActivityTrackingModal({
  opened,
  onClose,
  tracking,
  canEdit,
  logEnabled,
  onSave,
}: BoardActivityTrackingModalProps) {
  const [draft, setDraft] = useState<BoardActivityTrackingSettings>(tracking);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) {
      setDraft(tracking);
    }
  }, [opened, tracking]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch {
      // Parent hook restores previous tracking on failure.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Activity tracking categories" centered size="md">
      <Stack gap="md">
        {!logEnabled ? (
          <Text size="sm" c="dimmed">
            Enable the activity log on this board to start recording events in the categories you select.
          </Text>
        ) : null}
        <Stack gap="sm">
          {BOARD_ACTIVITY_TRACKING_CATEGORIES.map((category) => {
            const checked = draft[category.key] ?? false;
            return (
              <Checkbox
                key={category.key}
                label={category.label}
                description={category.description}
                checked={checked}
                disabled={!canEdit}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setDraft((prev) => ({ ...prev, [category.key]: next }));
                }}
              />
            );
          })}
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button type="button" variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} loading={saving} disabled={!canEdit}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
