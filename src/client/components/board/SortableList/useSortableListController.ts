import {
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { CardDB } from '../../../store/database.js';
import { compareCardListOrder } from '../../../../shared/utils/cardListPos.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { useBoardInteractionStore } from '../boardInteractionStore.js';
import {
  getBoardListColumnWidthChrome,
} from '../../../utils/boardListColumnWidth.js';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsStartDateOnCards,
} from '../../../../shared/utils/boardCardDateVisibility.js';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { PDND_KANBAN_LIST, PDND_KANBAN_LIST_COLUMN } from '../../../dnd/pragmatic/kanbanData.js';
import type { SortableListProps } from './types.js';
import { useSortableListActions } from './useSortableListActions.js';

interface SortableListController {
  readonly cardDateVisibility: {
    readonly showStartDateOnCards: boolean;
    readonly showDueDateOnCards: boolean;
    readonly showEndDateOnCards: boolean;
  };
  readonly renameModalOpen: boolean;
  readonly setRenameModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly renameValue: string;
  readonly setRenameValue: Dispatch<SetStateAction<string>>;
  readonly colorModalOpen: boolean;
  readonly setColorModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly listColorModalNonce: number;
  readonly setListColorModalNonce: Dispatch<SetStateAction<number>>;
  readonly renameSaving: boolean;
  readonly cardComposerOpen: boolean;
  readonly setCardComposerOpen: Dispatch<SetStateAction<boolean>>;
  readonly colourModalCardId: string | null;
  readonly setColourModalCardId: Dispatch<SetStateAction<string | null>>;
  readonly renameModalCardId: string | null;
  readonly setRenameModalCardId: Dispatch<SetStateAction<string | null>>;
  readonly renameCardTitle: string;
  readonly setRenameCardTitle: Dispatch<SetStateAction<string>>;
  readonly renameCardLoading: boolean;
  readonly duplicateListModalOpen: boolean;
  readonly setDuplicateListModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly duplicateCardTarget: CardDB | null;
  readonly setDuplicateCardTarget: Dispatch<SetStateAction<CardDB | null>>;
  readonly listTitleDragRef: MutableRefObject<HTMLDivElement | null>;
  readonly listColumnDropRef: MutableRefObject<HTMLDivElement | null>;
  readonly cardMenuFloatingTargetRef: MutableRefObject<HTMLButtonElement | null>;
  readonly bindListDnd: () => void;
  readonly sortedCards: CardDB[];
  readonly colourTargetCard: CardDB | null;
  readonly renameTargetCard: CardDB | null;
  readonly openCardMenuCardId: string | null;
  readonly closeCardMenu: () => void;
  readonly handleInlineCardCreated: (card: CardDB) => void;
  readonly handleRenameSubmit: () => Promise<void>;
  readonly handleSaveColor: (hex: string) => Promise<void>;
  readonly handleApplyColorToAll: (hex: string) => Promise<void>;
  readonly handleRemoveColorFromAll: () => Promise<void>;
  readonly openDeleteListModal: () => void;
  readonly saveCardColourForId: (cardId: string, hex: string) => Promise<void>;
  readonly handleApplyColorToAllInList: (hex: string) => Promise<void>;
  readonly handleRemoveColorFromAllInList: () => Promise<void>;
  readonly handleRenameCardSave: () => Promise<void>;
  readonly openDeleteCardForId: (cardId: string) => void;
  readonly listSourceDrag: boolean;
  readonly columnClassName: string;
  readonly cardMenuTargetCard: CardDB | null;
  readonly showListCardCount: boolean;
  readonly showHeaderActions: boolean;
  readonly columnBoxStyle: CSSProperties;
  readonly closeCardComposer: () => void;
}

export function useSortableListController(props: SortableListProps): SortableListController {
  const {
    list,
    cards,
    board,
    draggingListId = null,
    boardId,
    onCardCreated,
    onListUpdated,
    onCardUpdatedOnBoard,
    onCardDeletedFromBoard,
    onKanbanCardsReload,
    kanbanCaps,
  } = props;

  const cardDateVisibility = useMemo(
    () => ({
      showStartDateOnCards: boardShowsStartDateOnCards(board.settings),
      showDueDateOnCards: boardShowsDueDateOnCards(board.settings),
      showEndDateOnCards: boardShowsEndDateOnCards(board.settings),
    }),
    [board],
  );

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [colorModalOpen, setColorModalOpen] = useState(false);
  const [listColorModalNonce, setListColorModalNonce] = useState(0);
  const [renameSaving, setRenameSaving] = useState(false);
  const [cardComposerOpen, setCardComposerOpen] = useState(false);
  const [colourModalCardId, setColourModalCardId] = useState<string | null>(null);
  const [renameModalCardId, setRenameModalCardId] = useState<string | null>(null);
  const [renameCardTitle, setRenameCardTitle] = useState('');
  const [renameCardLoading, setRenameCardLoading] = useState(false);
  const [duplicateListModalOpen, setDuplicateListModalOpen] = useState(false);
  const [duplicateCardTarget, setDuplicateCardTarget] = useState<CardDB | null>(null);
  const listTitleDragRef = useRef<HTMLDivElement | null>(null);
  const listColumnDropRef = useRef<HTMLDivElement | null>(null);
  const listDndCleanupRef = useRef<(() => void) | null>(null);
  const cardMenuFloatingTargetRef = useRef<HTMLButtonElement | null>(null);
  const cardMenuTarget = useBoardInteractionStore((state) => state.cardMenuTarget);
  const closeCardMenu = useBoardInteractionStore((state) => state.closeCardMenu);

  const sortedCards = useMemo(() => [...cards].sort(compareCardListOrder), [cards]);

  const colourTargetCard =
    colourModalCardId != null ? (sortedCards.find((card) => card.id === colourModalCardId) ?? null) : null;
  const renameTargetCard =
    renameModalCardId != null ? (sortedCards.find((card) => card.id === renameModalCardId) ?? null) : null;

  /** Do not require `sortedCards.some(…)` — brief store vs. list-array skew can hide the id and block the menu. */
  const openCardMenuCardId =
    cardMenuTarget != null && cardMenuTarget.listId === list.id ? cardMenuTarget.cardId : null;

  useLayoutEffect(() => {
    const floater = cardMenuFloatingTargetRef.current;
    const column = listColumnDropRef.current;
    if (floater == null) {
      return;
    }
    const applyFloaterStyles = (styles: Readonly<Record<string, string>>): void => {
      Object.assign(floater.style, styles);
    };
    if (openCardMenuCardId == null) {
      applyFloaterStyles({
        position: 'absolute',
        left: '-9999px',
        top: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      return;
    }
    const rect = cardMenuTarget?.anchorRect ?? null;
    if (rect == null || column == null) {
      return;
    }
    /*
     * Swiper slides use `transform`, so `position: fixed` + viewport `getBoundingClientRect`
     * coords misalign the floater on iOS. Anchor inside the list column (`position: relative`)
     * with offsets from the column rect. Match the ⋮ hit target size so `bottom-end` menus
     * line up like a real `Menu.Target` on the button.
     */
    const colRect = column.getBoundingClientRect();
    applyFloaterStyles({
      position: 'absolute',
      left: `${rect.left - colRect.left}px`,
      top: `${rect.top - colRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '500',
    });
  }, [openCardMenuCardId, cardMenuTarget?.anchorRect]);

  const bindListDnd = useCallback((): void => {
    listDndCleanupRef.current?.();
    listDndCleanupRef.current = null;
    const columnEl = listColumnDropRef.current;
    const titleEl = listTitleDragRef.current;
    if (columnEl == null || titleEl == null) {
      return;
    }
    listDndCleanupRef.current = combine(
      dropTargetForElements({
        element: columnEl,
        getData: ({ element, input }) =>
          attachClosestEdge(
            {
              pdnd: PDND_KANBAN_LIST_COLUMN,
              kind: 'kanban-list-column',
              listId: list.id,
            } as const,
            { element, input, allowedEdges: ['left', 'right'] },
          ),
      }),
      kanbanCaps.canReorderLists
        ? draggable({
            element: titleEl,
            getInitialData: () =>
              ({
                pdnd: PDND_KANBAN_LIST,
                kind: 'kanban-list',
                listId: list.id,
                title: list.name,
              }) as const,
          })
        : () => {},
    );
  }, [list.id, list.name, kanbanCaps.canReorderLists]);

  useLayoutEffect(() => {
    bindListDnd();
    return () => {
      listDndCleanupRef.current?.();
      listDndCleanupRef.current = null;
    };
  }, [bindListDnd]);

  const closeCardComposer = useCallback((): void => {
    setCardComposerOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!kanbanCaps.canAddCard && cardComposerOpen) {
      setCardComposerOpen(false);
    }
    if (!kanbanCaps.canCardKanbanMenu) {
      closeCardMenu();
    }
  }, [kanbanCaps.canAddCard, kanbanCaps.canCardKanbanMenu, cardComposerOpen, closeCardMenu]);

  const handleInlineCardCreated = useCallback(
    (card: CardDB) => {
      onCardCreated?.(list.id, card);
    },
    [list.id, onCardCreated],
  );

  const {
    handleRenameSubmit,
    handleSaveColor,
    handleApplyColorToAll,
    handleRemoveColorFromAll,
    openDeleteListModal,
    saveCardColourForId,
    handleApplyColorToAllInList,
    handleRemoveColorFromAllInList,
    handleRenameCardSave,
    openDeleteCardForId,
  } = useSortableListActions({
    list,
    boardId,
    renameValue,
    setRenameModalOpen,
    setRenameSaving,
    onListUpdated,
    onKanbanCardsReload,
    onCardUpdatedOnBoard,
    onCardDeletedFromBoard,
    setColourModalCardId,
    renameTargetCard,
    renameCardTitle,
    setRenameModalCardId,
    setRenameCardLoading,
  });

  const widthChrome = useMemo(() => getBoardListColumnWidthChrome(board), [board]);
  const listSourceDrag = draggingListId === list.id;
  const columnClassName = `${widthChrome.columnClassName}${
    listSourceDrag ? ' board-column--list-dragging-source' : ''
  }${props.listReorderTarget ? ' board-column--list-reorder-target' : ''}`;

  const cardMenuTargetCard = useMemo((): CardDB | null => {
    if (openCardMenuCardId == null) {
      return null;
    }
    const fromSorted = sortedCards.find((card) => card.id === openCardMenuCardId);
    if (fromSorted != null) {
      return fromSorted;
    }
    const fromStore = useBoardRuntimeStore.getState().cardsById[openCardMenuCardId];
    return fromStore != null && fromStore.listId === list.id ? fromStore : null;
  }, [openCardMenuCardId, sortedCards, list.id]);

  const showListCardCount = board.settings.showListCardCount !== false;
  const showHeaderActions = showListCardCount || kanbanCaps.canListMenu;

  const columnBoxStyle = useMemo((): CSSProperties => {
    const colorExt: CSSProperties =
      list.color && list.color.trim().length > 0
        ? {
            ['--board-list-bg' as string]: list.color,
            ['--board-list-header-text' as string]: '#ffffff',
            ['--board-list-muted' as string]: 'rgba(255, 255, 255, 0.88)',
            ['--board-list-muted-strong' as string]: '#ffffff',
            ['--board-list-control-hover-bg' as string]: 'rgba(255, 255, 255, 0.18)',
            ['--board-card-drop-surface' as string]: list.color,
          }
        : {};
    return {
      ...widthChrome.columnStyle,
      ...colorExt,
    };
  }, [widthChrome, list.color]);

  return {
    cardDateVisibility,
    renameModalOpen,
    setRenameModalOpen,
    renameValue,
    setRenameValue,
    colorModalOpen,
    setColorModalOpen,
    listColorModalNonce,
    setListColorModalNonce,
    renameSaving,
    cardComposerOpen,
    setCardComposerOpen,
    colourModalCardId,
    setColourModalCardId,
    renameModalCardId,
    setRenameModalCardId,
    renameCardTitle,
    setRenameCardTitle,
    renameCardLoading,
    duplicateListModalOpen,
    setDuplicateListModalOpen,
    duplicateCardTarget,
    setDuplicateCardTarget,
    listTitleDragRef,
    listColumnDropRef,
    cardMenuFloatingTargetRef,
    bindListDnd,
    sortedCards,
    colourTargetCard,
    renameTargetCard,
    openCardMenuCardId,
    closeCardMenu,
    handleInlineCardCreated,
    handleRenameSubmit,
    handleSaveColor,
    handleApplyColorToAll,
    handleRemoveColorFromAll,
    openDeleteListModal,
    saveCardColourForId,
    handleApplyColorToAllInList,
    handleRemoveColorFromAllInList,
    handleRenameCardSave,
    openDeleteCardForId,
    listSourceDrag,
    columnClassName,
    cardMenuTargetCard,
    showListCardCount,
    showHeaderActions,
    columnBoxStyle,
    closeCardComposer,
  };
}
