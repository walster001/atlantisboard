import { memo } from 'react';
import { Box, Text, Button, ActionIcon, Group, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { VirtualizedCardList } from './VirtualizedCardList.js';
import { BoardInlineCardComposer } from './BoardInlineCardComposer.js';
import { sortableListPropsEqual, type SortableListProps } from './SortableList/types.js';
import { useSortableListController } from './SortableList/useSortableListController.js';
import { SortableListDialogs } from './SortableList/SortableListDialogs.js';
import { DuplicateListModal } from './DuplicateListModal.js';
import { DuplicateCardModal } from '../card/DuplicateCardModal.js';
import './boardView.css';

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
  kanbanCardTouchDragRequiresLongPress = false,
}: SortableListProps) {
  const {
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
    setColourModalCardId,
    setRenameModalCardId,
    renameCardTitle,
    setRenameCardTitle,
    renameCardLoading,
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
    duplicateListModalOpen,
    setDuplicateListModalOpen,
    duplicateCardTarget,
    setDuplicateCardTarget,
    columnClassName,
    cardMenuTargetCard,
    showListCardCount,
    showHeaderActions,
    columnBoxStyle,
    closeCardComposer,
  } = useSortableListController({
    list,
    cards,
    board,
    ...(assigneeDirectory != null ? { assigneeDirectory } : {}),
    draggingCardId,
    draggingListId,
    boardId,
    cardListMaxBodyPx,
    cardDropIndicator,
    listReorderTarget,
    ...(suppressCardOpenClickRef != null ? { suppressCardOpenClickRef } : {}),
    ...(onCardCreated != null ? { onCardCreated } : {}),
    ...(onListUpdated != null ? { onListUpdated } : {}),
    onOpenCard,
    onCardUpdatedOnBoard,
    onCardDeletedFromBoard,
    ...(onKanbanCardsReload != null ? { onKanbanCardsReload } : {}),
    kanbanCaps,
  });

  return (
    <Box
      ref={(node) => {
        listColumnDropRef.current = node;
        bindListDnd();
      }}
      className={columnClassName}
      style={columnBoxStyle}
      data-kanban-list-id={list.id}
    >
      <Group
        justify="space-between"
        align="flex-start"
        mb="xs"
        wrap="nowrap"
        gap="xs"
        className="board-column__header-row"
      >
        <Box
          ref={(node) => {
            listTitleDragRef.current = node;
            bindListDnd();
          }}
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
                  {kanbanCaps.canDuplicateList ? (
                    <Menu.Item
                      onClick={() => {
                        setDuplicateListModalOpen(true);
                      }}
                    >
                      Duplicate list
                    </Menu.Item>
                  ) : null}
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

      <Box style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <VirtualizedCardList
          cards={cards}
          listId={list.id}
          cardListMaxBodyPx={cardListMaxBodyPx}
          showDescriptionPreview={board.settings.showCardDescriptionPreview !== false}
          showStartDateOnCards={cardDateVisibility.showStartDateOnCards}
          showDueDateOnCards={cardDateVisibility.showDueDateOnCards}
          showEndDateOnCards={cardDateVisibility.showEndDateOnCards}
          {...(assigneeDirectory != null ? { assigneeDirectory } : {})}
          draggingCardId={draggingCardId ?? null}
          dropIndicator={cardDropIndicator ?? null}
          {...(suppressCardOpenClickRef != null ? { suppressCardOpenClickRef } : {})}
          onOpenCard={onOpenCard}
          onCardUpdatedOnBoard={onCardUpdatedOnBoard}
          onCardDeletedFromBoard={onCardDeletedFromBoard}
          showKanbanCardMenu={kanbanCaps.canCardKanbanMenu}
          kanbanCardBodyDraggable={kanbanCaps.canDragKanbanCards}
          {...(kanbanCardTouchDragRequiresLongPress ? { kanbanCardTouchDragRequiresLongPress: true } : {})}
        />
      </Box>

      {kanbanCaps.canCardKanbanMenu ? (
        <Menu
          opened={openCardMenuCardId != null}
          onChange={(opened) => {
            if (!opened) {
              closeCardMenu();
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
                closeCardMenu();
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
                closeCardMenu();
              }}
            >
              Rename card
            </Menu.Item>
            {kanbanCaps.canDuplicateCard ? (
              <Menu.Item
                onClick={(e) => {
                  e.stopPropagation();
                  if (cardMenuTargetCard != null) {
                    setDuplicateCardTarget(cardMenuTargetCard);
                  }
                  closeCardMenu();
                }}
              >
                Duplicate card
              </Menu.Item>
            ) : null}
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                if (cardMenuTargetCard != null) {
                  openDeleteCardForId(cardMenuTargetCard.id);
                }
                closeCardMenu();
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

      <SortableListDialogs
        list={list}
        renameModalOpen={renameModalOpen}
        setRenameModalOpen={setRenameModalOpen}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        renameSaving={renameSaving}
        handleRenameSubmit={handleRenameSubmit}
        listColorModalNonce={listColorModalNonce}
        colorModalOpen={colorModalOpen}
        setColorModalOpen={setColorModalOpen}
        handleSaveColor={handleSaveColor}
        handleApplyColorToAll={handleApplyColorToAll}
        handleRemoveColorFromAll={handleRemoveColorFromAll}
        colourTargetCard={colourTargetCard}
        setColourModalCardId={setColourModalCardId}
        saveCardColourForId={saveCardColourForId}
        handleApplyColorToAllInList={handleApplyColorToAllInList}
        handleRemoveColorFromAllInList={handleRemoveColorFromAllInList}
        renameTargetCard={renameTargetCard}
        setRenameModalCardId={setRenameModalCardId}
        renameCardTitle={renameCardTitle}
        setRenameCardTitle={setRenameCardTitle}
        renameCardLoading={renameCardLoading}
        handleRenameCardSave={handleRenameCardSave}
      />

      {duplicateListModalOpen ? (
        <DuplicateListModal
          listId={list.id}
          listName={list.name}
          boardId={boardId}
          boardName={board.name}
          workspaceId={board.workspaceId}
          onClose={() => setDuplicateListModalOpen(false)}
          onSuccess={() => {
            onListUpdated?.();
            void onKanbanCardsReload?.();
          }}
        />
      ) : null}

      {duplicateCardTarget != null ? (
        <DuplicateCardModal
          cardId={duplicateCardTarget.id}
          currentListId={list.id}
          boardId={boardId}
          boardName={board.name}
          workspaceId={board.workspaceId}
          onClose={() => setDuplicateCardTarget(null)}
          onSuccess={() => {
            void onKanbanCardsReload?.();
          }}
        />
      ) : null}
    </Box>
  );
}

export const SortableList = memo(SortableListInner, sortableListPropsEqual);
SortableList.displayName = 'SortableList';
