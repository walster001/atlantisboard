import {
  memo,
  useState,
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
} from '@mantine/core';
import { format } from 'date-fns';
import { IconAlignLeft, IconCalendar, IconDots } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { CardDescriptionBoardPreview } from '../card/CardDescriptionBoardPreview.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../card/cardDescriptionTiptap.js';
import { TwemojiPlainText } from '../common/TwemojiPlainText.js';
import './boardView.css';

interface SortableCardProps {
  card: CardDB;
  listId: string;
  showDescriptionPreview: boolean;
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

    if (cover.startsWith('/')) {
      return cover;
    }
    if (cover.startsWith('https://')) {
      return cover;
    }
    return '';
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

  return (
    <Box
      ref={deferRef}
      className={`board-card board-card--kanban${
        card.color && card.color.trim().length > 0 ? ' board-card--kanban-colored' : ''
      }${showKanbanCardMenu ? '' : ' board-card--kanban--no-card-menu'}`}
      data-kanban-list-id={listId}
      data-kanban-card-id={card.id}
      style={{
        opacity: isDragSource ? 0 : 1,
        padding: 'var(--mantine-spacing-md)',
        borderRadius: 'var(--mantine-radius-md)',
        transition: 'opacity 0.12s ease',
        position: 'relative',
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
        }`}
        style={
          kanbanCardBodyDraggable
            ? { cursor: 'grab', touchAction: 'none' }
            : { cursor: 'pointer', touchAction: 'auto' }
        }
        onClick={handleCardAreaClick}
      >
        {coverRenderUrl ? (
          <Box
            w="100%"
            h="10rem"
            mb="xs"
            style={{
              backgroundImage: `url(${coverRenderUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          />
        ) : null}

        {card.labels.length > 0 ? (
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
        ) : null}

        <Text component="div" className="board-card__kanban-title" fw={400}>
          {richReady ? (
            <TwemojiPlainText text={card.title} />
          ) : (
            <span style={{ wordBreak: 'break-word' }}>{card.title}</span>
          )}
        </Text>

        {showRichDescPreview ? (
          <Box
            mt={6}
            style={{
              minHeight: '2.75rem',
            }}
          >
            {richReady ? (
              <Text
                component="div"
                fw={200}
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
            ) : (
              <Text component="div" size="xs" c="dimmed" lineClamp={2}>
                …
              </Text>
            )}
          </Box>
        ) : null}
        {showDescriptionPreview &&
        !showRichDescPreview &&
        typeof card.descriptionPreview === 'string' &&
        card.descriptionPreview.trim() !== '' ? (
          <Text
            component="div"
            fw={200}
            c={card.color && card.color.trim().length > 0 ? 'white' : 'dimmed'}
            mt={6}
            lineClamp={2}
            className="board-card__desc board-card__kanban-desc"
            style={{
              whiteSpace: 'pre-line',
              ...(card.color && card.color.trim().length > 0 ? { opacity: 0.92 } : {}),
            }}
          >
            {richReady ? (
              <TwemojiPlainText text={card.descriptionPreview} />
            ) : (
              <span>{card.descriptionPreview}</span>
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

        {card.assignees.length > 0 ? (
          <Group gap={6} mt="xs" wrap="nowrap">
            {card.assignees.slice(0, 3).map((userId) => {
              const uid = String(userId);
              const u = assigneeDirectory?.get(uid);
              const src =
                u?.profilePicture != null && u.profilePicture !== '' ? u.profilePicture : null;
              return (
                <Avatar
                  key={uid}
                  size={APP_USER_AVATAR_SIZE}
                  {...(src != null ? { src } : {})}
                >
                  {userMenuStyleAvatarInitials(u?.displayName ?? '', u?.email ?? uid)}
                </Avatar>
              );
            })}
            {card.assignees.length > 3 ? (
              <Avatar size={APP_USER_AVATAR_SIZE}>
                {`+${card.assignees.length - 3}`}
              </Avatar>
            ) : null}
          </Group>
        ) : null}

        {card.dueDate ? (
          <Box className="board-card__kanban-due-wrap">
            <Badge
              size="xs"
              radius={4}
              variant={card.color && card.color.trim().length > 0 ? 'filled' : 'light'}
              color={card.color && card.color.trim().length > 0 ? 'gray' : 'gray'}
              leftSection={<IconCalendar size={11} stroke={1.5} aria-hidden />}
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
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

export const SortableCard = memo(SortableCardInner, sortableCardPropsEqual);
SortableCard.displayName = 'SortableCard';
