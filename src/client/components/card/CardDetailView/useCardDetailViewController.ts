import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsRemindersOnCards,
  boardShowsStartDateOnCards,
} from '../../../../shared/utils/boardCardDateVisibility.js';
import { useBoardPermissions } from '../../../hooks/useBoardPermissions.js';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { db, type BoardDB, type CardDB } from '../../../store/database.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { CARD_DETAIL_MODAL_STYLES, shouldAcceptIncomingCard } from './helpers.js';
import {
  discardPendingDescriptionMedia,
  type DescriptionPendingMediaRegistry,
} from '../../../utils/descriptionPendingMedia.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../cardDescriptionTiptap.js';
import { type DateFieldController, useDateField } from './cardDetailDateField.js';
import { useCardDetailViewControllerHandlers } from './useCardDetailViewControllerHandlers.js';

interface UseCardDetailViewControllerArgs {
  readonly initialCard: CardDB;
  readonly boardId: string;
  readonly boardWorkspaceId: string | null | undefined;
  readonly boardSettings: BoardDB['settings'] | undefined;
  readonly onClose: () => void;
  readonly onCardDeleted: (() => void) | undefined;
  readonly onCardUpdated: ((card: CardDB) => void) | undefined;
}

export interface CardDetailViewController {
  readonly isMobile: boolean;
  readonly card: CardDB;
  readonly title: string;
  readonly loading: boolean;
  readonly isEditing: boolean;
  readonly isEditingDescription: boolean;
  readonly showDuplicateModal: boolean;
  readonly modalStyles: {
    readonly body: Readonly<Record<string, unknown>>;
    readonly content: Readonly<Record<string, unknown>>;
    readonly header: Readonly<Record<string, unknown>>;
    readonly title: Readonly<Record<string, unknown>>;
  };
  readonly isDescriptionEmpty: boolean;
  readonly showStartDateOnCards: boolean;
  readonly showDueDateOnCards: boolean;
  readonly showEndDateOnCards: boolean;
  readonly showRemindersSection: boolean;
  readonly showLabels: boolean;
  readonly showAssignees: boolean;
  readonly showChecklist: boolean;
  readonly showAttachments: boolean;
  readonly showComments: boolean;
  readonly canEditCard: boolean;
  readonly canEditStartDate: boolean;
  readonly canEditDueDate: boolean;
  readonly canEditEndDate: boolean;
  readonly canDeleteCard: boolean;
  readonly canDuplicateCard: boolean;
  readonly boardName: string;
  readonly boardWorkspaceId: string | null | undefined;
  readonly canCreateComments: boolean;
  readonly canDeleteOthersComments: boolean;
  readonly due: DateFieldController;
  readonly start: DateFieldController;
  readonly end: DateFieldController;
  readonly setTitle: (value: string) => void;
  readonly setIsEditing: (value: boolean) => void;
  readonly setIsEditingDescription: (value: boolean) => void;
  readonly setShowDuplicateModal: (value: boolean) => void;
  readonly handleUpdateTitle: () => Promise<void>;
  readonly onDescriptionEditorReady: (editor: Editor | null) => void;
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
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly pendingDescriptionMediaRef: MutableRefObject<DescriptionPendingMediaRegistry>;
}

export function useCardDetailViewController({
  initialCard,
  boardId,
  boardWorkspaceId,
  boardSettings,
  onClose,
  onCardDeleted,
  onCardUpdated,
}: UseCardDetailViewControllerArgs): CardDetailViewController {
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const [card, setCard] = useState<CardDB>(initialCard);
  const [title, setTitle] = useState(card.title);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const descriptionEditorRef = useRef<Editor | null>(null);
  const pendingDescriptionMediaRef = useRef<DescriptionPendingMediaRegistry>(new Map());
  const cardRef = useRef(card);
  cardRef.current = card;

  const due = useDateField(card.dueDate);
  const start = useDateField(card.startDate);
  const end = useDateField(card.endDate);

  const showStartDateOnCards = boardShowsStartDateOnCards(boardSettings);
  const showDueDateOnCards = boardShowsDueDateOnCards(boardSettings);
  const showEndDateOnCards = boardShowsEndDateOnCards(boardSettings);
  const showRemindersSection = boardShowsRemindersOnCards(boardSettings);
  const showLabels = boardSettings?.showLabels !== false;
  const showAssignees = boardSettings?.showAssignees !== false;
  const showChecklist = boardSettings?.showChecklist !== false;
  const showAttachments = boardSettings?.showAttachments !== false;
  const showComments = boardSettings?.showComments !== false;

  const { can, loaded: boardPermsLoaded } = useBoardPermissions(boardId, boardWorkspaceId);
  const canEditCard = boardPermsLoaded && can('cards.update');
  const canEditStartDate = boardPermsLoaded && can('cards.dates.start.edit');
  const canEditDueDate = boardPermsLoaded && can('cards.dates.due.edit');
  const canEditEndDate = boardPermsLoaded && can('cards.dates.end.edit');
  const canDeleteCard = boardPermsLoaded && can('cards.delete');
  const canDuplicateCard = boardPermsLoaded && can('cards.duplicate');
  const boardName = useBoardRuntimeStore((state) => state.board?.name ?? 'This board');
  const canCreateComments = boardPermsLoaded && can('comments.create');
  const canDeleteOthersComments = boardPermsLoaded && can('comments.delete');

  const syncCardToBoardAndDexie = useCallback(
    (next: CardDB) => {
      setCard(next);
      onCardUpdated?.(next);
      void db.cards.put(next);
    },
    [onCardUpdated],
  );

  const parsedDescription = useMemo(() => parseCardDescriptionJson(card.description), [card.description]);
  const isDescriptionEmpty = isCardDescriptionEmpty(parsedDescription);
  const modalStyles = useMemo(
    () =>
      isMobile
        ? {
            ...CARD_DETAIL_MODAL_STYLES,
            content: {
              ...CARD_DETAIL_MODAL_STYLES.content,
              width: '100dvw',
              minWidth: '100dvw',
              maxWidth: '100dvw',
              height: '100dvh',
              minHeight: '100dvh',
              maxHeight: '100dvh',
              marginTop: 0,
              borderRadius: 0,
            },
            body: {
              ...CARD_DETAIL_MODAL_STYLES.body,
              paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))',
            },
          }
        : CARD_DETAIL_MODAL_STYLES,
    [isMobile],
  );

  useEffect(() => {
    const current = cardRef.current;
    if (initialCard.id !== current.id) {
      setCard(initialCard);
      setTitle(initialCard.title);
      return;
    }
    if (!isEditing && !isEditingDescription && shouldAcceptIncomingCard(current, initialCard)) {
      setCard(initialCard);
      setTitle(initialCard.title);
    }
  }, [initialCard, isEditing, isEditingDescription]);

  useEffect(() => {
    return () => {
      discardPendingDescriptionMedia(pendingDescriptionMediaRef.current);
    };
  }, []);

  const onDescriptionEditorReady = useCallback((editor: Editor | null) => {
    descriptionEditorRef.current = editor;
  }, []);
  const {
    handleUpdateTitle,
    handleUpdateDescription,
    handleCancelDescriptionEdit,
    onBeforeDeleteAttachment,
    handleSaveDueDate,
    handleClearDueDate,
    handleSaveStartDate,
    handleClearStartDate,
    handleSaveEndDate,
    handleClearEndDate,
    handleCopyCardLink,
    handleDeleteCard,
  } = useCardDetailViewControllerHandlers({
    boardId,
    card,
    cardRef,
    descriptionEditorRef,
    pendingDescriptionMediaRef,
    title,
    due,
    start,
    end,
    onClose,
    onCardDeleted,
    syncCardToBoardAndDexie,
    setTitle,
    setIsEditing,
    setIsEditingDescription,
    setLoading,
  });

  return {
    isMobile,
    card,
    title,
    loading,
    isEditing,
    isEditingDescription,
    showDuplicateModal,
    modalStyles,
    isDescriptionEmpty,
    showStartDateOnCards,
    showDueDateOnCards,
    showEndDateOnCards,
    showRemindersSection,
    showLabels,
    showAssignees,
    showChecklist,
    showAttachments,
    showComments,
    canEditCard,
    canEditStartDate,
    canEditDueDate,
    canEditEndDate,
    canDeleteCard,
    canDuplicateCard,
    boardName,
    boardWorkspaceId,
    canCreateComments,
    canDeleteOthersComments,
    due,
    start,
    end,
    setTitle,
    setIsEditing,
    setIsEditingDescription,
    setShowDuplicateModal,
    handleUpdateTitle,
    onDescriptionEditorReady,
    handleUpdateDescription,
    handleCancelDescriptionEdit,
    onBeforeDeleteAttachment,
    handleSaveDueDate,
    handleClearDueDate,
    handleSaveStartDate,
    handleClearStartDate,
    handleSaveEndDate,
    handleClearEndDate,
    handleCopyCardLink,
    handleDeleteCard,
    syncCardToBoardAndDexie,
    pendingDescriptionMediaRef,
  };
}
