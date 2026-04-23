import {
  memo,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import {
  Box,
  Text,
  Badge,
  Avatar,
  Group,
  Card,
  Tooltip,
} from '@mantine/core';
import { format } from 'date-fns';
import { IconAlignLeft, IconCalendarEvent, IconClock, IconDots, IconFlag } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { CardDescriptionBoardPreview } from '../card/CardDescriptionBoardPreview.js';
import {
  cardDescriptionFirstLogicalLinePlain,
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from '../card/cardDescriptionTiptap.js';
import { TwemojiPlainText } from '../common/TwemojiPlainText.js';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { PDND_KANBAN_CARD, PDND_KANBAN_CARD_DROP } from '../../dnd/pragmatic/kanbanData.js';
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
  /** Card-body pointer drag for reorder/move; off when user lacks `cards.move`/`cards.reorder`. */
  kanbanCardBodyDraggable: boolean;
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
    prev.assigneeDirectory === next.assigneeDirectory &&
    prev.isDragSource === next.isDragSource &&
    prev.suppressCardOpenClickRef === next.suppressCardOpenClickRef &&
    prev.onOpenCard === next.onOpenCard &&
    prev.onCardUpdatedOnBoard === next.onCardUpdatedOnBoard &&
    prev.onCardDeletedFromBoard === next.onCardDeletedFromBoard
  );
}

/** Same as IntersectionObserver `rootMargin` below (px on each side). */
const RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX = 240;

function createCardLiftedDragPreview(cardRoot: HTMLElement): {
  readonly preview: HTMLElement;
  readonly offsetX: number;
  readonly offsetY: number;
} {
  const rect = cardRoot.getBoundingClientRect();
  const preview = cardRoot.cloneNode(true) as HTMLElement;
  preview.classList.add('board-page__dnd-card-lift-preview');
  preview.querySelectorAll('[data-kanban-delegated-drag-ignore="1"]').forEach((el) => el.remove());
  preview.style.width = `${Math.max(1, Math.round(rect.width))}px`;
  preview.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  preview.style.minHeight = '0';
  // Keep only non-intrusive inline guardrails; let class CSS handle visual polish.
  preview.style.setProperty('opacity', '1', 'important');
  preview.setAttribute('aria-hidden', 'true');
  return {
    preview,
    offsetX: Math.round(rect.width / 2),
    offsetY: Math.round(rect.height / 2),
  };
}

function isElementNearViewport(el: HTMLElement, marginPx: number): boolean {
  const r = el.getBoundingClientRect();
  const vw = globalThis.window.innerWidth;
  const vh = globalThis.window.innerHeight;
  const m = marginPx;
  return r.bottom > -m && r.top < vh + m && r.right > -m && r.left < vw + m;
}

function useRichContentWhenNearViewport(): readonly [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) {
      return undefined;
    }

    let cancelled = false;
    let fallbackId: number | undefined;

    const markReady = (): void => {
      if (cancelled) {
        return;
      }
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
        fallbackId = undefined;
      }
      setReady(true);
    };

    fallbackId = globalThis.window.setTimeout(markReady, 100);

    if (isElementNearViewport(el, RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX)) {
      markReady();
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          markReady();
        }
      },
      { root: null, rootMargin: `${RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX}px`, threshold: 0 },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
      io.disconnect();
    };
  }, []);
  return [ref, ready] as const;
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
  assigneeDirectory,
  isDragSource = false,
  suppressCardOpenClickRef,
  onOpenCard,
  onCardUpdatedOnBoard: _onCardUpdatedOnBoard,
  onCardDeletedFromBoard: _onCardDeletedFromBoard,
}: SortableCardProps) {
  const [deferRef, richReady] = useRichContentWhenNearViewport();
  const cardRootRef = useRef<HTMLDivElement | null>(null);
  const cardBodyRef = useRef<HTMLDivElement | null>(null);
  const setCardRootRef = (node: HTMLDivElement | null): void => {
    cardRootRef.current = node;
    deferRef.current = node;
  };

  const coverRenderUrl = useMemo(() => {
    const cover = typeof card.cover === 'string' ? card.cover.trim() : '';
    if (cover === '') {
      return '';
    }

    const normalizeObjectPath = (raw: string): string => {
      try {
        const parsed = new URL(raw);
        return decodeURIComponent(parsed.pathname).replace(/^\/+/, '').split('/').slice(-2).join('/');
      } catch {
        return decodeURIComponent(raw.split('?')[0] ?? raw).replace(/^\/+/, '').split('/').slice(-2).join('/');
      }
    };

    const coverPath = normalizeObjectPath(cover);
    const coverAttachment = card.attachments.find((att) => normalizeObjectPath(att.url) === coverPath);
    if (coverAttachment) {
      return api.getAttachmentFileUrl(coverAttachment.id);
    }

    return api.resolveAttachmentUrl(cover);
  }, [card.attachments, card.cover]);

  const handleCardAreaClick = () => {
    if (suppressCardOpenClickRef?.current === true) {
      suppressCardOpenClickRef.current = false;
      return;
    }
    onOpenCard(card);
  };

  const hasDescription = typeof card.description === 'string' && card.description.trim() !== '';
  const descDocForPreview = useMemo(
    () => (hasDescription ? parseCardDescriptionJson(card.description) : null),
    [card.description, hasDescription],
  );
  const showRichDescPreview =
    showDescriptionPreview &&
    hasDescription &&
    descDocForPreview != null &&
    !isCardDescriptionEmpty(descDocForPreview);

  const descriptionFirstLinePlain = useMemo((): string => {
    if (!showRichDescPreview) {
      return '';
    }
    return cardDescriptionFirstLogicalLinePlain(card.description);
  }, [showRichDescPreview, card.description]);

  const descriptionPreviewFirstLine = useMemo((): string => {
    const raw = card.descriptionPreview;
    if (typeof raw !== 'string' || raw.trim() === '') {
      return '';
    }
    return (raw.split(/\r?\n/)[0] ?? '').trim();
  }, [card.descriptionPreview]);

  const kanbanLabelVisualKey = useMemo(
    () => card.labels.map((l) => `${l.id}:${l.color}:${l.name}`).join('|'),
    [card.labels],
  );

  const kanbanAssigneeVisualKey = useMemo(
    () => card.assignees.map(String).join('\0'),
    [card.assignees],
  );

  const kanbanLabelRow = useMemo(() => {
    if (card.labels.length === 0) {
      return null;
    }
    return (
      <Group gap={6} wrap="wrap" mb="xs" className="board-card__kanban-labels">
        {card.labels.map((label) => (
          <Badge
            key={label.id}
            size="sm"
            radius="xl"
            variant="filled"
            className="board-card__kanban-label-pill"
            styles={{
              root: {
                backgroundColor: label.color,
                textTransform: 'uppercase',
                fontWeight: 500,
              },
              label: { color: 'var(--mantine-color-white)' },
            }}
          >
            {label.name.toUpperCase()}
          </Badge>
        ))}
      </Group>
    );
  }, [kanbanLabelVisualKey]);

  const kanbanAssigneeRow = useMemo(() => {
    if (card.assignees.length === 0) {
      return null;
    }
    const totalAssignees = card.assignees.length;
    const useOverflowAvatar = totalAssignees > 4;
    const visibleAssignees = useOverflowAvatar ? card.assignees.slice(0, 3) : card.assignees;
    const overflowCount = totalAssignees - visibleAssignees.length;
    return (
      <Group gap={6} mt="xs" wrap="nowrap">
        {visibleAssignees.map((userId) => {
          const uid = String(userId);
          const u = assigneeDirectory?.get(uid);
          const displayName = u?.displayName?.trim() !== '' ? u?.displayName : uid;
          const email = u?.email?.trim() !== '' ? u?.email : 'No email';
          const src =
            u?.profilePicture != null && u.profilePicture !== '' ? u.profilePicture : null;
          return (
            <Tooltip
              key={uid}
              withArrow
              openDelay={120}
              position="top"
              withinPortal
              label={
                <Box>
                  <Text size="xs" fw={600} lh={1.2}>
                    {displayName}
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.2}>
                    {email}
                  </Text>
                </Box>
              }
            >
              <Avatar
                size={APP_USER_AVATAR_SIZE}
                {...(src != null ? { src } : {})}
              >
                {userMenuStyleAvatarInitials(u?.displayName ?? '', u?.email ?? uid)}
              </Avatar>
            </Tooltip>
          );
        })}
        {useOverflowAvatar ? (
          <Avatar size={APP_USER_AVATAR_SIZE}>{`+${overflowCount}`}</Avatar>
        ) : null}
      </Group>
    );
  }, [kanbanAssigneeVisualKey, assigneeDirectory]);

  useEffect(() => {
    const cardRootEl = cardRootRef.current;
    if (cardRootEl == null) {
      return undefined;
    }
    const cleanup = combine(
      !isDragSource
        ? dropTargetForElements({
            element: cardRootEl,
            getData: ({ input }) =>
              attachClosestEdge(
                {
                  pdnd: PDND_KANBAN_CARD_DROP,
                  kind: 'kanban-card-drop',
                  cardId: card.id,
                  listId,
                } as const,
                {
                  element: cardRootEl,
                  input,
                  allowedEdges: ['top', 'bottom'],
                },
              ),
            getIsSticky: () => true,
          })
        : () => {},
      kanbanCardBodyDraggable
        ? draggable({
            element: cardRootEl,
            getInitialData: () =>
              ({
                pdnd: PDND_KANBAN_CARD,
                kind: 'kanban-card',
                cardId: card.id,
                listId,
              }) as const,
            onGenerateDragPreview: ({ nativeSetDragImage }) => {
              const { preview, offsetX, offsetY } = createCardLiftedDragPreview(cardRootEl);
              document.body.appendChild(preview);
              if (nativeSetDragImage != null) {
                nativeSetDragImage(preview, offsetX, offsetY);
              }
              requestAnimationFrame(() => {
                preview.remove();
              });
            },
          })
        : () => {},
    );
    return cleanup;
  }, [card.id, listId, kanbanCardBodyDraggable, isDragSource]);

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
        ...(card.color && card.color.trim().length > 0
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
        ref={cardBodyRef}
        className={`board-card__kanban-body${
          kanbanCardBodyDraggable ? '' : ' board-card__kanban-body--no-drag'
        }`}
        style={
          kanbanCardBodyDraggable
            ? { cursor: 'grab', touchAction: 'none' }
            : { cursor: 'pointer', touchAction: 'auto' }
        }
        onClick={handleCardAreaClick}
      >
        {kanbanLabelRow}

        <Text component="div" className="board-card__kanban-title">
          {richReady ? (
            <TwemojiPlainText text={card.title} />
          ) : (
            <span style={{ wordBreak: 'break-word' }}>{card.title}</span>
          )}
        </Text>

        {showRichDescPreview ? (
          richReady ? (
            descriptionFirstLinePlain !== '' ? (
              <Text
                component="div"
                fw={200}
                mt={6}
                c={card.color && card.color.trim().length > 0 ? 'white' : 'dimmed'}
                lineClamp={2}
                className="board-card__desc board-card__kanban-desc"
                style={{
                  wordBreak: 'break-word',
                  ...(card.color && card.color.trim().length > 0 ? { opacity: 0.92 } : {}),
                }}
              >
                <TwemojiPlainText text={descriptionFirstLinePlain} />
              </Text>
            ) : (
              <Text
                component="div"
                fw={200}
                mt={6}
                c={card.color && card.color.trim().length > 0 ? 'white' : 'dimmed'}
                lineClamp={2}
                className="board-card__desc board-card__kanban-desc board-card__kanban-desc-board-preview"
                style={{
                  wordBreak: 'break-word',
                  ...(card.color && card.color.trim().length > 0 ? { opacity: 0.92 } : {}),
                }}
              >
                <div className="card-desc-tiptap-read card-desc-tiptap-read--board-preview">
                  <CardDescriptionBoardPreview valueJson={card.description} />
                </div>
              </Text>
            )
          ) : (
            <Text component="div" size="xs" c="dimmed" lineClamp={1} mt={6}>
              …
            </Text>
          )
        ) : null}
        {showDescriptionPreview && !showRichDescPreview && descriptionPreviewFirstLine !== '' ? (
          <Text
            component="div"
            fw={200}
            c={card.color && card.color.trim().length > 0 ? 'white' : 'dimmed'}
            mt={6}
            lineClamp={2}
            className="board-card__desc board-card__kanban-desc"
            style={{
              wordBreak: 'break-word',
              ...(card.color && card.color.trim().length > 0 ? { opacity: 0.92 } : {}),
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
                card.color && card.color.trim().length > 0
                  ? 'rgba(255, 255, 255, 0.92)'
                  : 'var(--mantine-color-gray-6)',
            }}
          >
            <IconAlignLeft size={14} stroke={1.8} aria-label="Description exists" />
          </Group>
        ) : null}

        {kanbanAssigneeRow}

        {(showStartDateOnCards && card.startDate != null) ||
        (showDueDateOnCards && card.dueDate != null) ||
        (showEndDateOnCards && card.endDate != null) ? (
          <Group gap={6} mt={6} wrap="wrap" className="board-card__kanban-due-wrap">
            {showStartDateOnCards && card.startDate != null ? (
              <Badge
                size="xs"
                radius={4}
                variant={card.color && card.color.trim().length > 0 ? 'filled' : 'light'}
                color={card.color && card.color.trim().length > 0 ? 'gray' : 'gray'}
                leftSection={<IconCalendarEvent size={11} stroke={1.5} aria-hidden />}
                className="board-card__kanban-due"
                styles={
                  card.color && card.color.trim().length > 0
                    ? {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                          backgroundColor: 'rgba(0, 0, 0, 0.32)',
                          color: '#ffffff',
                          border: 'none',
                        },
                        section: { color: '#ffffff' },
                        label: {
                          color: '#ffffff',
                          fontSize: 'inherit',
                          fontWeight: 'inherit',
                        },
                      }
                    : {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                        },
                        label: { fontSize: 'inherit', fontWeight: 'inherit' },
                      }
                }
              >
                {format(new Date(card.startDate), 'MMM d')}
              </Badge>
            ) : null}
            {showDueDateOnCards && card.dueDate != null ? (
              <Badge
                size="xs"
                radius={4}
                variant={card.color && card.color.trim().length > 0 ? 'filled' : 'light'}
                color={card.color && card.color.trim().length > 0 ? 'gray' : 'gray'}
                leftSection={<IconClock size={11} stroke={1.5} aria-hidden />}
                className="board-card__kanban-due"
                styles={
                  card.color && card.color.trim().length > 0
                    ? {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                          backgroundColor: 'rgba(0, 0, 0, 0.32)',
                          color: '#ffffff',
                          border: 'none',
                        },
                        section: { color: '#ffffff' },
                        label: {
                          color: '#ffffff',
                          fontSize: 'inherit',
                          fontWeight: 'inherit',
                        },
                      }
                    : {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                        },
                        label: { fontSize: 'inherit', fontWeight: 'inherit' },
                      }
                }
              >
                {format(new Date(card.dueDate), 'MMM d')}
              </Badge>
            ) : null}
            {showEndDateOnCards && card.endDate != null ? (
              <Badge
                size="xs"
                radius={4}
                variant={card.color && card.color.trim().length > 0 ? 'filled' : 'light'}
                color={card.color && card.color.trim().length > 0 ? 'gray' : 'gray'}
                leftSection={<IconFlag size={11} stroke={1.5} aria-hidden />}
                className="board-card__kanban-due"
                styles={
                  card.color && card.color.trim().length > 0
                    ? {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                          backgroundColor: 'rgba(0, 0, 0, 0.32)',
                          color: '#ffffff',
                          border: 'none',
                        },
                        section: { color: '#ffffff' },
                        label: {
                          color: '#ffffff',
                          fontSize: 'inherit',
                          fontWeight: 'inherit',
                        },
                      }
                    : {
                        root: {
                          fontSize: '0.6875rem',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          minHeight: '1.125rem',
                          paddingInline: 6,
                        },
                        label: { fontSize: 'inherit', fontWeight: 'inherit' },
                      }
                }
              >
                {format(new Date(card.endDate), 'MMM d')}
              </Badge>
            ) : null}
          </Group>
        ) : null}
      </Box>
    </Card>
  );
}

export const SortableCard = memo(SortableCardInner, sortableCardPropsEqual);
SortableCard.displayName = 'SortableCard';
