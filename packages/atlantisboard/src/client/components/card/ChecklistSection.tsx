import { Stack, Text, Button, Group } from '@mantine/core';
import { IconListCheck } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import { useChecklistSection } from './useChecklistSection.js';
import { ChecklistBlock } from './ChecklistBlock.js';
import { ChecklistRenameModal, ChecklistNewChecklistForm } from './ChecklistRenameModal.js';
import './checklistSection.css';

interface ChecklistSectionProps {
  card: CardDB;
  canEdit?: boolean;
  onCardUpdate: (card: CardDB) => void;
}

export function ChecklistSection({ card, canEdit = true, onCardUpdate }: ChecklistSectionProps) {
  const controller = useChecklistSection({ card, canEdit, onCardUpdate });
  const { showNewChecklist, isCreatingChecklist, handleOpenAddChecklist } = controller;

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconListCheck size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          <Text {...cardDetailSectionTitleProps}>Checklist</Text>
        </Group>
        {canEdit ? (
          <Button
            size="sm"
            variant="default"
            styles={cardDetailSoftButtonStyles}
            onClick={handleOpenAddChecklist}
            disabled={isCreatingChecklist}
          >
            + Add Item
          </Button>
        ) : null}
      </Group>

      {card.checklists.length === 0 && !showNewChecklist ? (
        <Text {...cardDetailEmptyStateProps}>
          No checklist items yet. Click Add Item to create one.
        </Text>
      ) : null}

      {card.checklists.map((checklist) => (
        <ChecklistBlock
          key={checklist.id}
          checklist={checklist}
          canEdit={canEdit}
          controller={controller}
        />
      ))}

      {showNewChecklist && canEdit ? <ChecklistNewChecklistForm controller={controller} /> : null}

      <ChecklistRenameModal canEdit={canEdit} controller={controller} />
    </Stack>
  );
}
