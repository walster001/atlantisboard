import { Button, Group, Modal, Stack } from '@mantine/core';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../../constants/iosModalSafeArea.js';

interface ReplaceButtonsColourModalProps {
  readonly opened: boolean;
  readonly title: string;
  readonly fullScreen: boolean;
  readonly pickerDraftHex: string;
  readonly pickerDraftUseImportDefault: boolean;
  readonly onPickerDraftHexChange: (hex: string) => void;
  readonly onUseImportDefault: () => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}

export function ReplaceButtonsColourModal({
  opened,
  title,
  fullScreen,
  pickerDraftHex,
  pickerDraftUseImportDefault,
  onPickerDraftHexChange,
  onUseImportDefault,
  onClose,
  onSave,
}: ReplaceButtonsColourModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered={!fullScreen}
      size="lg"
      fullScreen={fullScreen}
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
      styles={modalStylesFullscreenSafeBody(fullScreen)}
      radius="md"
      zIndex={520}
      overlayProps={{ backgroundOpacity: 0.45 }}
      padding="lg"
    >
      <Stack gap="md">
        <BoardColourPickerPanel
          value={pickerDraftHex}
          onChange={(hex) => {
            onPickerDraftHexChange(hex);
          }}
          onClearColor={onUseImportDefault}
          noColorSelected={pickerDraftUseImportDefault}
          sectionLabel=""
        />
        <Group justify="flex-end" gap="sm" mt="md">
          <Button variant="default" radius="md" onClick={onClose}>
            Cancel
          </Button>
          <Button radius="md" onClick={onSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
