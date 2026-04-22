import { useState } from 'react';
import { Modal, Stack, Group, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';

interface ListColorPickerModalProps {
  opened: boolean;
  onClose: () => void;
  initialColor: string;
  onSave: (hex: string) => void | Promise<void>;
  onApplyToAll: (hex: string) => void | Promise<void>;
  onRemoveFromAll: () => void | Promise<void>;
  modalTitle?: string;
  applyErrorTitle?: string;
  removeErrorTitle?: string;
  applyAllLabel?: string;
  removeAllLabel?: string;
}

export function ListColorPickerModal({
  opened,
  onClose,
  initialColor,
  onSave,
  onApplyToAll,
  onRemoveFromAll,
  modalTitle = 'List colour',
  applyErrorTitle = 'Could not apply colour to all lists',
  removeErrorTitle = 'Could not remove colour from all lists',
  applyAllLabel = 'Apply to all',
  removeAllLabel = 'Remove from all',
}: ListColorPickerModalProps) {
  const [selectedColor, setSelectedColor] = useState(() =>
    normalizePresetHex(initialColor || '#3b82f6', BOARD_PRESET_COLOURS),
  );
  const [useThemeDefault, setUseThemeDefault] = useState(() => initialColor.trim().length === 0);
  const [saving, setSaving] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(useThemeDefault ? '' : selectedColor.trim());
      onClose();
    } catch (e) {
      notifications.show({
        title: 'Could not save colour',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToAll = async (): Promise<void> => {
    if (useThemeDefault) {
      return;
    }
    setApplyingAll(true);
    try {
      await onApplyToAll(selectedColor.trim());
    } catch (e) {
      notifications.show({
        title: applyErrorTitle,
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setApplyingAll(false);
    }
  };

  const handleRemoveFromAll = async (): Promise<void> => {
    setRemovingAll(true);
    try {
      await onRemoveFromAll();
      setUseThemeDefault(true);
    } catch (e) {
      notifications.show({
        title: removeErrorTitle,
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setRemovingAll(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={modalTitle} centered size="lg">
      <Stack gap="md">
        <BoardColourPickerPanel
          value={selectedColor}
          onChange={(hex) => {
            setSelectedColor(hex);
            setUseThemeDefault(false);
          }}
          onClearColor={() => setUseThemeDefault(true)}
          noColorSelected={useThemeDefault}
          disabled={saving || applyingAll || removingAll}
        />
        <Group justify="space-between" gap="xs" mt="md">
          <Group gap="xs">
            <Button
              variant="default"
              onClick={() => void handleApplyToAll()}
              disabled={saving || removingAll || useThemeDefault}
              loading={applyingAll}
            >
              {applyAllLabel}
            </Button>
            <Button
              variant="default"
              onClick={() => void handleRemoveFromAll()}
              disabled={saving || applyingAll}
              loading={removingAll}
            >
              {removeAllLabel}
            </Button>
          </Group>
          <Group gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving || applyingAll || removingAll}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={applyingAll || removingAll}>
            Save
          </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
