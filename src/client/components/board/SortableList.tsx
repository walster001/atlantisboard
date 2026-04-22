import {
  useState,
  useCallback,
  useMemo,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type CSSProperties,
} from 'react';
import {
  Box,
  Text,
  Button,
  ActionIcon,
  Group,
  Menu,
  Modal,
  TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDots } from '@tabler/icons-react';
import { db, type ListDB, type CardDB, type BoardDB } from '../../store/database.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { api } from '../../utils/api.js';
import { transformList, normalizeCardFromApi } from '../../utils/transform.js';
import {
  getBoardListColumnWidthChrome,
  getBoardListColumnWidthPx,
} from '../../utils/boardListColumnWidth.js';
import { CARD_TITLE_MAX_LENGTH } from '../../constants/cardFieldLimits.js';
import { VirtualizedCardList, type CardDropIndicatorTarget } from './VirtualizedCardList.js';
import { BoardInlineCardComposer } from './BoardInlineCardComposer.js';
import { ListColorPickerModal } from '../lists/ListColorPickerModal.js';
import type { KanbanBoardEditCaps } from '../../hooks/useBoardPermissions.js';
import './boardView.css';

interface SortableListProps {
  list: ListDB;
  cards: CardDB[];
  board: BoardDB;
  kanbanCaps: KanbanBoardEditCaps;
  assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
  draggingCardId?: string | null;
  draggingListId?: string | null;
  boardId: string;
  cardListMaxBodyPx: number;
  cardDropIndicator?: CardDropIndicatorTarget | null;
  listReorderTarget?: boolean;
  suppressCardOpenClickRef?: MutableRefObject<boolean>;
  onCardCreated?: (listId: string, card: CardDB) => void;
  onListUpdated?: () => void;
  onOpenCard: (card: CardDB) => void;
  onCardUpdatedOnBoard: (card: CardDB) => void;
  onCardDeletedFromBoard: (cardId: string) => void;
  /** After bulk card colour API + Dexie patch, reload Kanban card state from IndexedDB. */
  onKanbanCardsReload?: () => void;
}

function sortableListPropsEqual(
  prev: Readonly<SortableListProps>,
  next: Readonly<SortableListProps>,
): boolean {
  return (
    prev.list === next.list &&
    prev.board === next.board &&
    prev.cards === next.cards &&
    prev.assigneeDirectory === next.assigneeDirectory &&
    prev.draggingCardId === next.draggingCardId &&
    prev.draggingListId === next.draggingListId &&
    prev.boardId === next.boardId &&
    prev.cardListMaxBodyPx === next.cardListMaxBodyPx &&
    prev.cardDropIndicator === next.cardDropIndicator &&
    prev.listReorderTarget === next.listReorderTarget &&
    prev.suppressCardOpenClickRef === next.suppressCardOpenClickRef &&
    prev.onCardCreated === next.onCardCreated &&
    prev.onListUpdated === next.onListUpdated &&
    prev.onOpenCard === next.onOpenCard &&
    prev.onCardUpdatedOnBoard === next.onCardUpdatedOnBoard &&
    prev.onCardDeletedFromBoard === next.onCardDeletedFromBoard &&
    prev.onKanbanCardsReload === next.onKanbanCardsReload &&
    prev.kanbanCaps.canAddList === next.kanbanCaps.canAddList &&
    prev.kanbanCaps.canListMenu === next.kanbanCaps.canListMenu &&
    prev.kanbanCaps.canAddCard === next.kanbanCaps.canAddCard &&
    prev.kanbanCaps.canCardKanbanMenu === next.kanbanCaps.canCardKanbanMenu &&
    prev.kanbanCaps.canDragKanbanCards === next.kanbanCaps.canDragKanbanCards &&
    prev.kanbanCaps.canReorderLists === next.kanbanCaps.canReorderLists
  );
}

function SortableListInner({
  list,
  cards,
  board,
  assigneeDirectory,
  draggingCardId = null,
  draggingListId = null,
  boardId,
  cardListMaxBodyPx,
  cardDropIndicator = null,
  listReorderTarget = false,
  suppressCardOpenClickRef,
  onCardCreated,
  onListUpdated,
  onOpenCard,
  onCardUpdatedOnBoard,
  onCardDeletedFromBoard,
  onKanbanCardsReload,
  kanbanCaps,
}: SortableListProps) {
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
  const [cardMenuCardId, setCardMenuCardId] = useState<string | null>(null);
  const cardListDelegationRef = useRef<HTMLDivElement | null>(null);
  const cardMenuAnchorRectRef = useRef<DOMRect | null>(null);
  const cardMenuFloatingTargetRef = useRef<HTMLButtonElement | null>(null);

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    [cards],
  );

  const colourTargetCard = colourModalCardId != null ? sortedCards.find((c) => c.id === colourModalCardId) : null;
  const renameTargetCard = renameModalCardId != null ? sortedCards.find((c) => c.id === renameModalCardId) : null;

  const openCardMenuCardId =
    cardMenuCardId != null && sortedCards.some((c) => c.id === cardMenuCardId) ? cardMenuCardId : null;

  useLayoutEffect(() => {
    const floater = cardMenuFloatingTargetRef.current;
    if (floater == null) {
      return;
    }
    if (openCardMenuCardId == null) {
      floater.style.position = 'fixed';
      floater.style.left = '-9999px';
      floater.style.top = '0';
      floater.style.width = '1px';
      floater.style.height = '1px';
      floater.style.opacity = '0';
      floater.style.pointerEvents = 'none';
      return;
    }
    const rect = cardMenuAnchorRectRef.current;
    if (rect == null) {
      return;
    }
    floater.style.position = 'fixed';
    floater.style.left = `${rect.right - 1}px`;
    floater.style.top = `${rect.bottom}px`;
    floater.style.width = '1px';
    floater.style.height = '1px';
    floater.style.opacity = '0';
    floater.style.pointerEvents = 'none';
    floater.style.zIndex = '500';
  }, [openCardMenuCardId]);

  useEffect(() => {
    const root = cardListDelegationRef.current;
    if (root == null) {
      return undefined;
    }
    const onClickCapture = (e: MouseEvent): void => {
      const t = e.target;
      if (!(t instanceof Element)) {
        return;
      }
      const trigger = t.closest<HTMLElement>('[data-kanban-card-menu-trigger="1"]');
      if (trigger == null) {
        return;
      }
      /* Card root must include list id; the ⋮ button also has data-kanban-card-id, so :closest would match the button first. */
      const cardRoot = trigger.closest<HTMLElement>(
        '[data-kanban-list-id][data-kanban-card-id]',
      );
      if (cardRoot?.getAttribute('data-kanban-list-id') !== list.id) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const cardId = trigger.getAttribute('data-kanban-card-id');
      if (cardId == null || cardId === '') {
        return;
      }
      cardMenuAnchorRectRef.current = trigger.getBoundingClientRect();
      setCardMenuCardId(cardId);
    };
    root.addEventListener('click', onClickCapture, true);
    return () => {
      root.removeEventListener('click', onClickCapture, true);
    };
  }, [list.id, kanbanCaps.canCardKanbanMenu]);

  const closeCardComposer = useCallback((): void => {
    setCardComposerOpen(false);
  }, []);

  useEffect(() => {
    if (!kanbanCaps.canAddCard && cardComposerOpen) {
      setCardComposerOpen(false);
    }
    if (!kanbanCaps.canCardKanbanMenu) {
      setCardMenuCardId(null);
    }
  }, [kanbanCaps.canAddCard, kanbanCaps.canCardKanbanMenu, cardComposerOpen]);

  const handleInlineCardCreated = useCallback(
    (cardDb: CardDB) => {
      onCardCreated?.(list.id, cardDb);
    },
    [list.id, onCardCreated],
  );

  const applyListFromApi = useCallback(
    async (response: { list: unknown }): Promise<void> => {
      const next = transformList(response.list);
      await db.lists.put(next);
      onListUpdated?.();
    },
    [onListUpdated],
  );

  const handleRenameSubmit = async (): Promise<void> => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0 || trimmed === list.name) {
      setRenameModalOpen(false);
      return;
    }
    setRenameSaving(true);
    try {
      const res = await api.updateList(list.id, { name: trimmed });
      await applyListFromApi(res as { list: unknown });
      setRenameModalOpen(false);
      notifications.show({
        title: 'List renamed',
        message: `List is now "${trimmed}".`,
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: e instanceof Error ? e.message : 'Failed to rename list',
        color: 'red',
      });
    } finally {
      setRenameSaving(false);
    }
  };

  const handleSaveColor = async (hex: string): Promise<void> => {
    const res = await api.updateList(list.id, { color: hex });
    await applyListFromApi(res as { list: unknown });
    notifications.show({
      title: 'Colour saved',
      message: hex.trim().length === 0 ? 'List colour reset to theme default.' : 'List colour updated.',
      color: 'green',
    });
  };

  const updateBoardListsColor = useCallback(
    async (hex: string): Promise<{ updated: number; failed: number }> => {
      try {
        const res = await api.patchBoardListsBulkColor(boardId, { color: hex });
        const trimmed = hex.trim();
        await db.lists.where('boardId').equals(boardId).modify((l) => {
          if (trimmed === '') {
            delete l.color;
          } else {
            l.color = trimmed;
          }
        });
        onListUpdated?.();
        return { updated: res.updatedCount, failed: 0 };
      } catch {
        return { updated: 0, failed: 1 };
      }
    },
    [boardId, onListUpdated],
  );

  const handleApplyColorToAll = useCallback(
    async (hex: string): Promise<void> => {
      const { updated, failed } = await updateBoardListsColor(hex);
      if (failed > 0) {
        notifications.show({
          title: 'Applied with issues',
          message: `Updated ${updated} lists, ${failed} failed.`,
          color: 'yellow',
        });
        return;
      }
      notifications.show({
        title: 'Colour applied',
        message: `Applied to ${updated} lists.`,
        color: 'green',
      });
    },
    [updateBoardListsColor],
  );

  const handleRemoveColorFromAll = useCallback(async (): Promise<void> => {
    const { updated, failed } = await updateBoardListsColor('');
    if (failed > 0) {
      notifications.show({
        title: 'Removed with issues',
        message: `Updated ${updated} lists, ${failed} failed.`,
        color: 'yellow',
      });
      return;
    }
    notifications.show({
      title: 'Colour removed',
      message: `Removed custom colour from ${updated} lists.`,
      color: 'green',
    });
  }, [updateBoardListsColor]);

  const openDeleteListModal = useCallback((): void => {
    modals.openConfirmModal({
      title: 'Delete list?',
      centered: true,
      children: (
        <Text size="sm">
          This will permanently delete the list &quot;{list.name}&quot; and all cards in it. This
          action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete list', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const r = await api.deleteList(list.id);
          if (!r.removed) {
            useBoardRuntimeStore.getState().removeList(list.id);
            await db.cards.where('listId').equals(list.id).delete();
            await db.lists.delete(list.id);
            onListUpdated?.();
            notifications.show({
              title: 'List removed',
              message:
                'This list was already gone on the server. Your board has been updated to match.',
              color: 'green',
            });
            return;
          }
          notifications.show({
            title: 'List deleted',
            message: 'The list has been removed.',
            color: 'green',
          });
        } catch (e) {
          notifications.show({
            title: 'Error',
            message: e instanceof Error ? e.message : 'Failed to delete list',
            color: 'red',
          });
        }
      },
    });
  }, [list.id, list.name, onListUpdated]);

  const saveCardColourForId = async (cardId: string, hex: string): Promise<void> => {
    try {
      const response = await api.updateCard(cardId, { color: hex });
      const updated = normalizeCardFromApi((response as { card: unknown }).card, cardId);
      onCardUpdatedOnBoard(updated);
      setColourModalCardId(null);
    } catch (error) {
      console.error('Error updating card colour:', error);
      notifications.show({
        color: 'red',
        title: 'Could not update colour',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const updateCurrentListCardsColor = useCallback(
    async (hex: string): Promise<{ updated: number; failed: number }> => {
      try {
        const res = await api.patchBoardCardsBulkColor(boardId, { color: hex, listId: list.id });
        const trimmed = hex.trim();
        await db.cards.where('listId').equals(list.id).modify((c) => {
          if (trimmed === '') {
            delete c.color;
          } else {
            c.color = trimmed;
          }
        });
        onKanbanCardsReload?.();
        return { updated: res.updatedCount, failed: 0 };
      } catch {
        return { updated: 0, failed: 1 };
      }
    },
    [boardId, list.id, onKanbanCardsReload],
  );

  const handleApplyColorToAllInList = useCallback(
    async (hex: string): Promise<void> => {
      const { updated, failed } = await updateCurrentListCardsColor(hex);
      if (failed > 0) {
        notifications.show({
          title: 'Applied with issues',
          message: `Updated ${updated} cards, ${failed} failed.`,
          color: 'yellow',
        });
        return;
      }
      notifications.show({
        title: 'Colour applied',
        message: `Applied to ${updated} cards in this list.`,
        color: 'green',
      });
    },
    [updateCurrentListCardsColor],
  );

  const handleRemoveColorFromAllInList = useCallback(async (): Promise<void> => {
    const { updated, failed } = await updateCurrentListCardsColor('');
    if (failed > 0) {
      notifications.show({
        title: 'Removed with issues',
        message: `Updated ${updated} cards, ${failed} failed.`,
        color: 'yellow',
      });
      return;
    }
    notifications.show({
      title: 'Colour removed',
      message: `Removed card colour from ${updated} cards in this list.`,
      color: 'green',
    });
  }, [updateCurrentListCardsColor]);

  const handleRenameCardSave = async (): Promise<void> => {
    if (renameTargetCard == null) {
      return;
    }
    const next = renameCardTitle.trim();
    if (next === '') {
      notifications.show({
        color: 'yellow',
        title: 'Title required',
        message: 'Card title cannot be empty.',
      });
      return;
    }
    if (next.length > CARD_TITLE_MAX_LENGTH) {
      notifications.show({
        color: 'red',
        title: 'Title too long',
        message: `Title cannot exceed ${CARD_TITLE_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (next === renameTargetCard.title) {
      setRenameModalCardId(null);
      return;
    }
    setRenameCardLoading(true);
    try {
      const response = await api.updateCard(renameTargetCard.id, { title: next });
      const updated = normalizeCardFromApi((response as { card: unknown }).card, renameTargetCard.id);
      onCardUpdatedOnBoard(updated);
      setRenameModalCardId(null);
    } catch (error) {
      console.error('Error renaming card:', error);
      notifications.show({
        color: 'red',
        title: 'Could not rename card',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setRenameCardLoading(false);
    }
  };

  const openDeleteCardForId = useCallback(
    (cardId: string): void => {
      modals.openConfirmModal({
        title: 'Delete card',
        children: (
          <Text size="sm">
            This card will be permanently deleted, including comments, checklists, and attachments.
          </Text>
        ),
        labels: { confirm: 'Delete card', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        zIndex: 520,
        onConfirm: async () => {
          try {
            await api.deleteCard(cardId);
            await db.cards.delete(cardId);
            onCardDeletedFromBoard(cardId);
            notifications.show({
              color: 'gray',
              title: 'Card deleted',
              message: 'The card has been removed.',
            });
          } catch (error) {
            console.error('Error deleting card:', error);
            notifications.show({
              color: 'red',
              title: 'Could not delete card',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },
      });
    },
    [onCardDeletedFromBoard],
  );

  const listColumnWidthPx = getBoardListColumnWidthPx(board);
  const widthChrome = useMemo(
    () => getBoardListColumnWidthChrome(board),
    [listColumnWidthPx, board],
  );
  const listSourceDrag = draggingListId === list.id;
  const columnClassName = `${widthChrome.columnClassName}${
    listSourceDrag ? ' board-column--list-dragging-source' : ''
  }${listReorderTarget ? ' board-column--list-reorder-target' : ''}`;

  const cardMenuTargetCard =
    openCardMenuCardId != null ? sortedCards.find((c) => c.id === openCardMenuCardId) ?? null : null;

  const showListCardCount = board.settings.showListCardCount !== false;
  const showHeaderActions = showListCardCount || kanbanCaps.canListMenu;

  const columnBoxStyle = useMemo((): CSSProperties => {
    const colorExt: CSSProperties =
      list.color && list.color.trim().length > 0
        ? {
            backgroundColor: list.color,
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

  return (
    <Box
      className={columnClassName}
      style={columnBoxStyle}
      data-kanban-list-id={list.id}
    >
      <Group justify="space-between" align="flex-start" mb="xs" wrap="nowrap" gap="xs">
        <Box
          className="board-column__title-row"
          style={{ flex: 1, minWidth: 0, touchAction: 'none' }}
        >
          <Text
            className="board-column__title"
            component="span"
            style={{
              display: 'block',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              overflow: 'visible',
            }}
          >
            {list.name}
          </Text>
        </Box>
        {showHeaderActions ? (
          <Group
            className="board-column__header-actions"
            gap={4}
            wrap="nowrap"
            align="center"
            style={{ flexShrink: 0 }}
          >
            {showListCardCount ? (
              <Text component="span" className="board-column__count">
                {sortedCards.length}
              </Text>
            ) : null}
            {kanbanCaps.canListMenu ? (
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    className="board-column__menu"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="List options"
                  >
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => {
                      setRenameValue(list.name);
                      setRenameModalOpen(true);
                    }}
                  >
                    Rename list
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => {
                      setListColorModalNonce((n) => n + 1);
                      setColorModalOpen(true);
                    }}
                  >
                    List colour
                  </Menu.Item>
                  <Menu.Item color="red" onClick={openDeleteListModal}>
                    Delete list
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : null}
          </Group>
        ) : null}
      </Group>

      <Box
        ref={cardListDelegationRef}
        style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <VirtualizedCardList
          cards={cards}
          listId={list.id}
          cardListMaxBodyPx={cardListMaxBodyPx}
          showDescriptionPreview={board.settings.showCardDescriptionPreview !== false}
          {...(assigneeDirectory != null ? { assigneeDirectory } : {})}
          draggingCardId={draggingCardId ?? null}
          dropIndicator={cardDropIndicator ?? null}
          {...(suppressCardOpenClickRef != null ? { suppressCardOpenClickRef } : {})}
          onOpenCard={onOpenCard}
          onCardUpdatedOnBoard={onCardUpdatedOnBoard}
          onCardDeletedFromBoard={onCardDeletedFromBoard}
          showKanbanCardMenu={kanbanCaps.canCardKanbanMenu}
          kanbanCardBodyDraggable={kanbanCaps.canDragKanbanCards}
        />
      </Box>

      {kanbanCaps.canCardKanbanMenu ? (
        <Menu
          opened={openCardMenuCardId != null}
          onChange={(opened) => {
            if (!opened) {
              setCardMenuCardId(null);
            }
          }}
          position="bottom-end"
          shadow="md"
          width={200}
          zIndex={400}
          closeOnItemClick
          withinPortal
        >
          <Menu.Target>
            <button
              ref={cardMenuFloatingTargetRef}
              type="button"
              tabIndex={-1}
              aria-hidden
            />
          </Menu.Target>
          <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
            <Menu.Item
              onClick={(e) => {
                e.stopPropagation();
                if (cardMenuTargetCard != null) {
                  setColourModalCardId(cardMenuTargetCard.id);
                }
                setCardMenuCardId(null);
              }}
            >
              Card colour
            </Menu.Item>
            <Menu.Item
              onClick={(e) => {
                e.stopPropagation();
                if (cardMenuTargetCard != null) {
                  setRenameCardTitle(cardMenuTargetCard.title);
                  setRenameModalCardId(cardMenuTargetCard.id);
                }
                setCardMenuCardId(null);
              }}
            >
              Rename card
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                if (cardMenuTargetCard != null) {
                  openDeleteCardForId(cardMenuTargetCard.id);
                }
                setCardMenuCardId(null);
              }}
            >
              Delete card
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : null}

      {cardComposerOpen ? (
        <BoardInlineCardComposer
          listId={list.id}
          boardId={boardId}
          position={sortedCards.length}
          onCreated={handleInlineCardCreated}
          onCancel={closeCardComposer}
        />
      ) : kanbanCaps.canAddCard ? (
        <Button
          variant="subtle"
          size="sm"
          fullWidth
          mt="xs"
          className="board-column__add"
          onClick={() => setCardComposerOpen(true)}
        >
          + Add a card
        </Button>
      ) : null}

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
          onChange={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
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
        onClick={(e) => e.stopPropagation()}
      >
        {renameTargetCard != null ? (
          <>
            <TextInput
              label="Title"
              value={renameCardTitle}
              onChange={(e) => setRenameCardTitle(e.currentTarget.value)}
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
    </Box>
  );
}

export const SortableList = memo(SortableListInner, sortableListPropsEqual);
SortableList.displayName = 'SortableList';
