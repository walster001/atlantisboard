import {
  memo,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { Box, Text, Group, Card } from '@mantine/core';
import { IconAlignLeft, IconDots } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import {
  createCardLiftedDragPreview,
  resolveCardCoverRenderUrl,
  useRichContentWhenNearViewport,
} from './sortableCardHelpers.js';
import { TwemojiPlainText } from '../common/TwemojiPlainText.js';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PDND_KANBAN_CARD } from '../../dnd/pragmatic/kanbanData.js';
import { KanbanAssigneeRow, KanbanDateBadgesRow, KanbanLabelRow } from './SortableCardMetaRows.js';
import { useKanbanTouchDragArm } from './useKanbanTouchDragArm.js';
import { useSortableCardDescriptionPreview } from './sortableCardDescriptionPreview.js';
import './boardView.css';

interface SortableCardProps {
  card: CardDB;
  listId: string;
  showDescriptionPreview: boolean;
  showStartDateOnCards: boolean;
  showDueDateOnCards: boolean;
  showEndDateOnCards: boolean;
  /** Kanban ⋮ menu (colour / rename / delete) — off for viewers without `cards.update`/`cards.delete`. */
  showKanbanCardMenu: boolean;
  readonly kanbanCardBodyDraggable: boolean;
  /** Mobile carousel: long-press must arm before native drag so Embla does not steal the gesture. */
  readonly kanbanCardTouchDragRequiresLongPress?: boolean;
  /** Board + workspace member directory for assignee faces on the card tile. */
  assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
  isDragSource?: boolean;
  suppressCardOpenClickRef?: MutableRefObject<boolean>;
  onOpenCard: (card: CardDB) => void;
  onCardUpdatedOnBoard: (card: CardDB) => void;
  onCardDeletedFromBoard: (cardId: string) => void;
}

function sortableCardPropsEqual(
  prev: Readonly<SortableCardProps>,
  next: Readonly<SortableCardProps>,
): boolean {
  return (
    prev.card === next.card &&
    prev.listId === next.listId &&
    prev.showDescriptionPreview === next.showDescriptionPreview &&
    prev.showStartDateOnCards === next.showStartDateOnCards &&
    prev.showDueDateOnCards === next.showDueDateOnCards &&
    prev.showEndDateOnCards === next.showEndDateOnCards &&
    prev.showKanbanCardMenu === next.showKanbanCardMenu &&
    prev.kanbanCardBodyDraggable === next.kanbanCardBodyDraggable &&
    (prev.kanbanCardTouchDragRequiresLongPress ?? false) === (next.kanbanCardTouchDragRequiresLongPress ?? false) &&
    prev.assigneeDirectory === next.assigneeDirectory &&
    prev.isDragSource === next.isDragSource &&
    prev.suppressCardOpenClickRef === next.suppressCardOpenClickRef &&
    prev.onOpenCard === next.onOpenCard &&
    prev.onCardUpdatedOnBoard === next.onCardUpdatedOnBoard &&
    prev.onCardDeletedFromBoard === next.onCardDeletedFromBoard
  );
}

function SortableCardInner({
  card,
  listId,
  showDescriptionPreview,
  showStartDateOnCards,
  showDueDateOnCards,
  showEndDateOnCards,
  showKanbanCardMenu,
  kanbanCardBodyDraggable,
  kanbanCardTouchDragRequiresLongPress = false,
  assigneeDirectory,
  isDragSource = false,
  suppressCardOpenClickRef,
  onOpenCard,
  onCardUpdatedOnBoard: _onCardUpdatedOnBoard,
  onCardDeletedFromBoard: _onCardDeletedFromBoard,
}: SortableCardProps) {
  const [deferRef, richReady] = useRichContentWhenNearViewport();
  const cardRootRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const touchArmOptions = useMemo(
    () =>
      kanbanCardTouchDragRequiresLongPress
        ? ({
            requireTouchArmForNativeDrag: true,
            longPressMs: 400,
            /** Wider slop: Swiper / Android touch jitter cancels arming too easily with 18px. */
            cancelMoveSlopPx: 28,
          } as const)
        : undefined,
    [kanbanCardTouchDragRequiresLongPress],
  );
  const touchArm = useKanbanTouchDragArm(kanbanCardBodyDraggable, touchArmOptions);
  const {
    hasDescription,
    showRichDescPreview,
    descriptionPreviewFirstLine,
    deferredDescriptionFallbackText,
  } = useSortableCardDescriptionPreview(card, showDescriptionPreview);
  const hasCardColour = card.color != null && card.color.trim().length > 0;
  const descColor = hasCardColour ? 'white' : 'dimmed';
  const setCardRootRef = (node: HTMLDivElement | null): void => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    cardRootRef.current = node;
    deferRef.current = node;
    if (node == null || isDragSource || !kanbanCardBodyDraggable) {
      return;
    }
    dragCleanupRef.current = draggable({
      element: node,
      canDrag: touchArm.canDragForNative,
      getInitialData: () =>
        ({
          pdnd: PDND_KANBAN_CARD,
          kind: 'kanban-card',
          cardId: card.id,
          listId,
        }) as const,
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        const { preview, offsetX, offsetY } = createCardLiftedDragPreview(node);
        document.body.appendChild(preview);
        if (nativeSetDragImage != null) {
          nativeSetDragImage(preview, offsetX, offsetY);
        }
        requestAnimationFrame(() => {
          preview.remove();
        });
      },
    });
  };

  const coverRenderUrl = useMemo(
    () => resolveCardCoverRenderUrl(card),
    [card.attachments, card.cover],
  );

  const handleCardAreaClick = () => {
    if (suppressCardOpenClickRef?.current === true) {
      suppressCardOpenClickRef.current = false;
      return;
    }
    onOpenCard(card);
  };

  return (
    <Card
      ref={setCardRootRef}
      className={`board-card board-card--kanban${
        card.color && card.color.trim().length > 0 ? ' board-card--kanban-colored' : ''
      }${showKanbanCardMenu ? '' : ' board-card--kanban--no-card-menu'}`}
      data-kanban-list-id={listId}
      data-kanban-card-id={card.id}
      padding={0}
      radius={12}
      styles={{ root: { padding: '14px' } }}
      style={{
        opacity: isDragSource ? 0 : 1,
        transition: 'opacity 0.12s ease',
        position: 'relative',
        overflow: 'hidden',
        ...(hasCardColour
          ? ({
              ['--board-card-bg' as string]: card.color,
              ['--board-card-title-color' as string]: '#ffffff',
              ['--board-card-desc-color' as string]: 'rgba(255, 255, 255, 0.92)',
              ['--board-card-menu-color' as string]: '#ffffff',
              ['--board-card-menu-hover-bg' as string]: 'rgba(255, 255, 255, 0.18)',
            } as const)
          : {}),
      }}
    >
      {coverRenderUrl ? (
        <Card.Section
          className="board-card__kanban-cover"
          mb="xs"
          style={{
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <Box
            w="100%"
            h="10rem"
            style={{
              backgroundImage: `url(${coverRenderUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        </Card.Section>
      ) : null}

      {showKanbanCardMenu ? (
        <Box className="board-card__kanban-menu" data-kanban-delegated-drag-ignore="1">
          <button
            type="button"
            className="board-card__kanban-menu-trigger"
            data-kanban-card-menu-trigger="1"
            data-kanban-card-id={card.id}
            aria-label="Card actions"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <IconDots size={18} stroke={1.5} />
          </button>
        </Box>
      ) : null}

      <Box
        className={`board-card__kanban-body${
          kanbanCardBodyDraggable ? '' : ' board-card__kanban-body--no-drag'
        }${touchArm.touchArmedForDrag ? ' board-card__kanban-body--touch-armed' : ''}`}
        onPointerDown={touchArm.onPointerDown}
        onPointerMove={touchArm.onPointerMove}
        onPointerUp={touchArm.onPointerUp}
        onPointerCancel={touchArm.onPointerCancel}
        style={
          kanbanCardBodyDraggable
            ? {
                cursor: 'grab',
                touchAction:
                  kanbanCardTouchDragRequiresLongPress && touchArm.touchArmedForDrag
                    ? 'none'
                    : kanbanCardTouchDragRequiresLongPress
                      ? 'pan-x pan-y'
                      : 'pan-y',
              }
            : { cursor: 'pointer', touchAction: 'auto' }
        }
        onClick={handleCardAreaClick}
      >
        <KanbanLabelRow labels={card.labels} />

        <Text component="div" className="board-card__kanban-title">
          {richReady ? (
            <TwemojiPlainText text={card.title} />
          ) : (
            <span style={{ wordBreak: 'break-word' }}>{card.title}</span>
          )}
        </Text>

        {showRichDescPreview ? (
          richReady ? (
            <Text
              component="div"
              fw={200}
              mt={6}
              c={descColor}
              lineClamp={2}
              className="board-card__desc board-card__kanban-desc"
              style={{
                wordBreak: 'break-word',
                ...(hasCardColour ? { opacity: 0.92 } : {}),
              }}
            >
              <TwemojiPlainText text={deferredDescriptionFallbackText} />
            </Text>
          ) : (
            <Text
              component="div"
              fw={200}
              mt={6}
              c={descColor}
              lineClamp={2}
              className="board-card__desc board-card__kanban-desc"
              style={{
                wordBreak: 'break-word',
                ...(hasCardColour ? { opacity: 0.92 } : {}),
              }}
            >
              <span>{deferredDescriptionFallbackText}</span>
            </Text>
          )
        ) : null}
        {showDescriptionPreview && !showRichDescPreview && descriptionPreviewFirstLine !== '' ? (
          <Text
            component="div"
            fw={200}
            c={descColor}
            mt={6}
            lineClamp={2}
            className="board-card__desc board-card__kanban-desc"
            style={{
              wordBreak: 'break-word',
              ...(hasCardColour ? { opacity: 0.92 } : {}),
            }}
          >
            {richReady ? (
              <TwemojiPlainText text={descriptionPreviewFirstLine} />
            ) : (
              <span>{descriptionPreviewFirstLine}</span>
            )}
          </Text>
        ) : null}
        {!showDescriptionPreview &&
        (hasDescription ||
          (typeof card.descriptionPreview === 'string' && card.descriptionPreview.trim() !== '')) ? (
          <Group
            gap={6}
            mt={6}
            justify="flex-start"
            align="center"
            style={{
              color:
                hasCardColour
                  ? 'rgba(255, 255, 255, 0.92)'
                  : 'var(--mantine-color-gray-6)',
            }}
          >
            <IconAlignLeft size={14} stroke={1.8} aria-label="Description exists" />
          </Group>
        ) : null}

        <KanbanAssigneeRow
          assignees={card.assignees}
          {...(assigneeDirectory !== undefined ? { assigneeDirectory } : {})}
        />
        <KanbanDateBadgesRow
          card={card}
          showStartDateOnCards={showStartDateOnCards}
          showDueDateOnCards={showDueDateOnCards}
          showEndDateOnCards={showEndDateOnCards}
        />
      </Box>
    </Card>
  );
}

export const SortableCard = memo(SortableCardInner, sortableCardPropsEqual);
SortableCard.displayName = 'SortableCard';
