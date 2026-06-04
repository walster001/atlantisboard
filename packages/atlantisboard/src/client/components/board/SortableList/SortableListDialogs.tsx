import { memo } from 'react';
import { Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { CARD_TITLE_MAX_LENGTH } from '../../../constants/cardFieldLimits.js';
import { ListColorPickerModal } from '../../lists/ListColorPickerModal.js';
import type { CardDB, ListDB } from '../../../store/database.js';

interface SortableListDialogsProps {
  readonly list: ListDB;
  readonly renameModalOpen: boolean;
  readonly setRenameModalOpen: (next: boolean) => void;
  readonly renameValue: string;
  readonly setRenameValue: (next: string) => void;
  readonly renameSaving: boolean;
  readonly handleRenameSubmit: () => Promise<void>;
  readonly listColorModalNonce: number;
  readonly colorModalOpen: boolean;
  readonly setColorModalOpen: (next: boolean) => void;
  readonly handleSaveColor: (hex: string) => Promise<void>;
  readonly handleApplyColorToAll: (hex: string) => Promise<void>;
  readonly handleRemoveColorFromAll: () => Promise<void>;
  readonly colourTargetCard: CardDB | null;
  readonly setColourModalCardId: (next: string | null) => void;
  readonly saveCardColourForId: (cardId: string, hex: string) => Promise<void>;
  readonly handleApplyColorToAllInList: (hex: string) => Promise<void>;
  readonly handleRemoveColorFromAllInList: () => Promise<void>;
  readonly renameTargetCard: CardDB | null;
  readonly setRenameModalCardId: (next: string | null) => void;
  readonly renameCardTitle: string;
  readonly setRenameCardTitle: (next: string) => void;
  readonly renameCardLoading: boolean;
  readonly handleRenameCardSave: () => Promise<void>;
}

export const SortableListDialogs = memo(function SortableListDialogs({
  list,
  renameModalOpen,
  setRenameModalOpen,
  renameValue,
  setRenameValue,
  renameSaving,
  handleRenameSubmit,
  listColorModalNonce,
  colorModalOpen,
  setColorModalOpen,
  handleSaveColor,
  handleApplyColorToAll,
  handleRemoveColorFromAll,
  colourTargetCard,
  setColourModalCardId,
  saveCardColourForId,
  handleApplyColorToAllInList,
  handleRemoveColorFromAllInList,
  renameTargetCard,
  setRenameModalCardId,
  renameCardTitle,
  setRenameCardTitle,
  renameCardLoading,
  handleRenameCardSave,
}: SortableListDialogsProps) {
  return (
    <>
      <Modal
        opened={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Rename list"
        centered
        radius="md"
      >
        <TextInput
          label="Name"
          value={renameValue}
          onChange={(event) => setRenameValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleRenameSubmit();
            }
          }}
          mb="md"
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRenameModalOpen(false)} disabled={renameSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleRenameSubmit()} loading={renameSaving}>
            Save
          </Button>
        </Group>
      </Modal>

      <ListColorPickerModal
        key={`list-${list.id}-${listColorModalNonce}`}
        opened={colorModalOpen}
        onClose={() => setColorModalOpen(false)}
        initialColor={list.color ?? ''}
        onSave={handleSaveColor}
        onApplyToAll={handleApplyColorToAll}
        onRemoveFromAll={handleRemoveColorFromAll}
      />

      {colourTargetCard != null ? (
        <ListColorPickerModal
          key={`card-${colourTargetCard.id}`}
          opened
          onClose={() => setColourModalCardId(null)}
          initialColor={colourTargetCard.color ?? ''}
          onSave={(hex) => void saveCardColourForId(colourTargetCard.id, hex)}
          onApplyToAll={handleApplyColorToAllInList}
          onRemoveFromAll={handleRemoveColorFromAllInList}
          modalTitle="Card colour"
          applyErrorTitle="Could not apply colour to all cards in list"
          removeErrorTitle="Could not remove colour from all cards in list"
          applyAllLabel="Apply to all cards in list"
          removeAllLabel="Remove from all cards in list"
        />
      ) : null}

      <Modal
        opened={renameTargetCard != null}
        onClose={() => setRenameModalCardId(null)}
        title="Rename card"
        centered
        zIndex={450}
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
        onClick={(event) => event.stopPropagation()}
      >
        {renameTargetCard != null ? (
          <>
            <TextInput
              label="Title"
              value={renameCardTitle}
              onChange={(event) => setRenameCardTitle(event.currentTarget.value)}
              maxLength={CARD_TITLE_MAX_LENGTH}
              autoFocus
              mb="md"
            />
            <Text size="xs" c="dimmed">
              {renameCardTitle.length}/{CARD_TITLE_MAX_LENGTH}
            </Text>
            <Group justify="flex-end" gap="xs" mt="md">
              <Button variant="subtle" onClick={() => setRenameModalCardId(null)}>
                Cancel
              </Button>
              <Button loading={renameCardLoading} onClick={() => void handleRenameCardSave()}>
                Save
              </Button>
            </Group>
          </>
        ) : null}
      </Modal>
    </>
  );
});
