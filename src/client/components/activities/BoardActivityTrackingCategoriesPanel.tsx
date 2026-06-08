import { useEffect, useState } from 'react';
import { Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import {
  BOARD_ACTIVITY_TRACKING_CATEGORIES,
  type BoardActivityTrackingSettings,
} from '../../../shared/constants/boardContentActivities.js';

interface BoardActivityTrackingCategoriesPanelProps {
  readonly tracking: BoardActivityTrackingSettings;
  readonly canEdit: boolean;
  readonly logEnabled: boolean;
  readonly onSave: (tracking: BoardActivityTrackingSettings) => Promise<void>;
  readonly onCancel: () => void;
}

export function BoardActivityTrackingCategoriesPanel({
  tracking,
  canEdit,
  logEnabled,
  onSave,
  onCancel,
}: BoardActivityTrackingCategoriesPanelProps) {
  const [draft, setDraft] = useState<BoardActivityTrackingSettings>(tracking);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(tracking);
  }, [tracking]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // Parent hook restores previous tracking on failure.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md" className="board-activity-config-modal__panel">
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
      <Group justify="flex-end" gap="sm" className="board-activity-config-modal__footer">
        <Button type="button" variant="default" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSave()} loading={saving} disabled={!canEdit}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
