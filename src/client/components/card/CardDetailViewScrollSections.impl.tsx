import { memo } from 'react';
import { Box } from '@mantine/core';
import { IconCalendarEvent, IconClock, IconFlag } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { AttachmentSection } from './AttachmentSection.js';
import { AssigneeSection } from './AssigneeSection.js';
import { ChecklistSection } from './ChecklistSection.js';
import { CommentSection } from './CommentSection.js';
import { LabelSection } from './LabelSection.js';
import { ReminderSection } from './ReminderSection.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
} from './cardDetailSectionUi.js';
import {
  CardDateTimeSection,
  LazyMountWhenVisible,
} from './CardDetailViewScrollSections/dateSections.js';
import '@mantine/dates/styles.css';

export interface CardDetailViewScrollSectionsProps {
  readonly card: CardDB;
  readonly boardId: string;
  readonly loading: boolean;
  readonly showStartDateOnCards: boolean;
  readonly showDueDateOnCards: boolean;
  readonly showEndDateOnCards: boolean;
  readonly showRemindersSection: boolean;
  readonly showLabels: boolean;
  readonly showAssignees: boolean;
  readonly showChecklist: boolean;
  readonly showAttachments: boolean;
  readonly showComments: boolean;
  readonly canCreateComments: boolean;
  readonly canDeleteOthersComments: boolean;
  readonly canEditCard: boolean;
  readonly canEditStartDate: boolean;
  readonly canEditDueDate: boolean;
  readonly canEditEndDate: boolean;
  readonly startLocal: string;
  readonly setStartLocal: (value: string) => void;
  readonly startPickerOpened: boolean;
  readonly setStartPickerOpened: (opened: boolean) => void;
  readonly onSaveStartDate: () => void | Promise<void>;
  readonly onClearStartDate: () => Promise<void>;
  readonly dueLocal: string;
  readonly setDueLocal: (value: string) => void;
  readonly duePickerOpened: boolean;
  readonly setDuePickerOpened: (opened: boolean) => void;
  readonly onSaveDueDate: () => void | Promise<void>;
  readonly onClearDueDate: () => Promise<void>;
  readonly endLocal: string;
  readonly setEndLocal: (value: string) => void;
  readonly endPickerOpened: boolean;
  readonly setEndPickerOpened: (opened: boolean) => void;
  readonly onSaveEndDate: () => void | Promise<void>;
  readonly onClearEndDate: () => Promise<void>;
  readonly syncCardToBoardAndDexie: (next: CardDB) => void;
  readonly onBeforeDeleteAttachment?: (attachmentId: string) => Promise<void>;
}

export const CardDetailViewScrollSections = memo(function CardDetailViewScrollSections({
  card,
  boardId,
  loading,
  showStartDateOnCards,
  showDueDateOnCards,
  showEndDateOnCards,
  showRemindersSection,
  showLabels,
  showAssignees,
  showChecklist,
  showAttachments,
  showComments,
  canCreateComments,
  canDeleteOthersComments,
  canEditCard,
  canEditStartDate,
  canEditDueDate,
  canEditEndDate,
  startLocal,
  setStartLocal,
  startPickerOpened,
  setStartPickerOpened,
  onSaveStartDate,
  onClearStartDate,
  dueLocal,
  setDueLocal,
  duePickerOpened,
  setDuePickerOpened,
  onSaveDueDate,
  onClearDueDate,
  endLocal,
  setEndLocal,
  endPickerOpened,
  setEndPickerOpened,
  onSaveEndDate,
  onClearEndDate,
  syncCardToBoardAndDexie,
  onBeforeDeleteAttachment,
}: CardDetailViewScrollSectionsProps) {
  return (
    <>
      {showStartDateOnCards ? (
        <CardDateTimeSection
          title="Start date"
          titleIcon={
            <IconCalendarEvent size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          }
          value={card.startDate}
          loading={loading}
          canEdit={canEditStartDate}
          localValue={startLocal}
          setLocalValue={setStartLocal}
          pickerOpened={startPickerOpened}
          setPickerOpened={setStartPickerOpened}
          onSave={onSaveStartDate}
          onClear={onClearStartDate}
          setButtonLabel="Set start date"
          emptyReadonlyLabel="No start date"
          modalTitle="Start date & time"
          timeInputAriaLabel="Start time"
          clearAriaLabel="Clear start date"
        />
      ) : null}

      {showDueDateOnCards ? (
        <CardDateTimeSection
          title="Due date"
          titleIcon={<IconClock size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />}
          value={card.dueDate}
          loading={loading}
          canEdit={canEditDueDate}
          localValue={dueLocal}
          setLocalValue={setDueLocal}
          pickerOpened={duePickerOpened}
          setPickerOpened={setDuePickerOpened}
          onSave={onSaveDueDate}
          onClear={onClearDueDate}
          setButtonLabel="Set due date"
          emptyReadonlyLabel="No due date"
          modalTitle="Due date & time"
          timeInputAriaLabel="Due time"
          clearAriaLabel="Clear due date"
        />
      ) : null}

      {showEndDateOnCards ? (
        <CardDateTimeSection
          title="End date"
          titleIcon={<IconFlag size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />}
          value={card.endDate}
          loading={loading}
          canEdit={canEditEndDate}
          localValue={endLocal}
          setLocalValue={setEndLocal}
          pickerOpened={endPickerOpened}
          setPickerOpened={setEndPickerOpened}
          onSave={onSaveEndDate}
          onClear={onClearEndDate}
          setButtonLabel="Set end date"
          emptyReadonlyLabel="No end date"
          modalTitle="End date & time"
          timeInputAriaLabel="End time"
          clearAriaLabel="Clear end date"
        />
      ) : null}

      {showRemindersSection ? (
        <Box mt={showStartDateOnCards || showDueDateOnCards || showEndDateOnCards ? 'md' : 0}>
          <ReminderSection
            card={card}
            canEdit={canEditCard}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </Box>
      ) : null}

      {showLabels ? (
        <LabelSection
          card={card}
          boardId={boardId}
          canEdit={canEditCard}
          onCardUpdate={(updatedCard) => {
            syncCardToBoardAndDexie(updatedCard);
          }}
        />
      ) : null}

      {showAssignees ? (
        <AssigneeSection
          card={card}
          boardId={boardId}
          canEdit={canEditCard}
          onCardUpdate={(updatedCard) => {
            syncCardToBoardAndDexie(updatedCard);
          }}
        />
      ) : null}

      {showChecklist ? (
        <LazyMountWhenVisible minHeight={160}>
          <ChecklistSection
            card={card}
            canEdit={canEditCard}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}

      {showAttachments ? (
        <LazyMountWhenVisible minHeight={180}>
          <AttachmentSection
            card={card}
            canEdit={canEditCard}
            {...(onBeforeDeleteAttachment != null ? { onBeforeDeleteAttachment } : {})}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}

      {showComments ? (
        <LazyMountWhenVisible minHeight={200}>
          <CommentSection
            card={card}
            boardId={boardId}
            canCreateComments={canCreateComments}
            canDeleteOthersComments={canDeleteOthersComments}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}
    </>
  );
});
