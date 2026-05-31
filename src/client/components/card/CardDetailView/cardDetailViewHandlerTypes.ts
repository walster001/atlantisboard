import type { Editor } from '@tiptap/core';
import type { MutableRefObject } from 'react';
import type { CardDB } from '../../../store/database.js';
import type { DateFieldController } from './cardDetailDateField.js';
import type { DescriptionPendingMediaRegistry } from '../../../utils/descriptionPendingMedia.js';

export type DateFieldKind = 'dueDate' | 'startDate' | 'endDate';

export interface SharedCardActionArgs {
  readonly card: CardDB;
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly notifyNormalizeFailure: () => void;
}

export interface DescriptionUpdateArgs extends SharedCardActionArgs {
  readonly editor: Editor | null;
  readonly pendingDescriptionMedia: DescriptionPendingMediaRegistry;
}

export interface DeleteAttachmentPreflightArgs {
  readonly cardRef: { current: CardDB };
  readonly descriptionEditorRef: { current: Editor | null };
  readonly attachmentId: string;
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly notifyNormalizeFailure: () => void;
}

export interface SaveDateFieldArgs extends SharedCardActionArgs {
  readonly kind: DateFieldKind;
  readonly value: string;
  readonly close: () => void;
  readonly label: string;
}

export interface ClearDateFieldArgs extends SharedCardActionArgs {
  readonly kind: DateFieldKind;
  readonly close: () => void;
}

export interface UseCardDetailViewControllerHandlersArgs {
  readonly boardId: string;
  readonly card: CardDB;
  readonly cardRef: MutableRefObject<CardDB>;
  readonly descriptionEditorRef: MutableRefObject<Editor | null>;
  readonly pendingDescriptionMediaRef: MutableRefObject<DescriptionPendingMediaRegistry>;
  readonly title: string;
  readonly due: DateFieldController;
  readonly start: DateFieldController;
  readonly end: DateFieldController;
  readonly onClose: () => void;
  readonly onCardDeleted: (() => void) | undefined;
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly setTitle: (value: string) => void;
  readonly setIsEditing: (value: boolean) => void;
  readonly setIsEditingDescription: (value: boolean) => void;
  readonly setLoading: (value: boolean) => void;
}

export interface CardDetailViewControllerHandlers {
  readonly handleUpdateTitle: () => Promise<void>;
  readonly handleUpdateDescription: () => Promise<void>;
  readonly handleCancelDescriptionEdit: () => void;
  readonly onBeforeDeleteAttachment: (attachmentId: string) => Promise<void>;
  readonly handleSaveDueDate: () => Promise<void>;
  readonly handleClearDueDate: () => Promise<void>;
  readonly handleSaveStartDate: () => Promise<void>;
  readonly handleClearStartDate: () => Promise<void>;
  readonly handleSaveEndDate: () => Promise<void>;
  readonly handleClearEndDate: () => Promise<void>;
  readonly handleCopyCardLink: () => Promise<void>;
  readonly handleDeleteCard: () => void;
}
