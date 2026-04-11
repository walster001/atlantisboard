import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { isAxiosError } from 'axios';
import { Stack, Text, Textarea, Button, Group, Box, Avatar } from '@mantine/core';
import { IconMessageCircle } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { CardDB } from '../../store/database.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import { loadBoardMemberUsersForDisplay, type BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { useAuthContext } from '../../contexts/AuthContext.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailSectionTitleProps,
} from './cardDetailSectionUi.js';

function isAbortOrCancelError(error: unknown): boolean {
  return (
    (isAxiosError(error) && (error.code === 'ERR_CANCELED' || error.name === 'CanceledError')) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

const commentTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface CommentThreadListProps {
  readonly comments: CardDB['comments'];
  readonly memberById: ReadonlyMap<string, BoardMemberUserDisplay>;
  readonly user: {
    id: string;
    displayName: string;
    username: string;
    profilePicture?: string;
  } | null;
  readonly loading: boolean;
  readonly canDeleteOthersComments: boolean;
  readonly onDeleteComment: (commentId: string) => void;
}

const CommentThreadList = memo(function CommentThreadList({
  comments,
  memberById,
  user,
  loading,
  canDeleteOthersComments,
  onDeleteComment,
}: CommentThreadListProps) {
  return (
    <Stack gap="xs">
      {comments.map((comment) => {
        const authorId = String(comment.userId);
        const member = memberById.get(authorId);
        const displayName =
          member?.displayName?.trim() ??
          (user != null && authorId === String(user.id) ? 'You' : '');
        const label = displayName.length > 0 ? displayName : 'Unknown user';
        const canDelete =
          user != null && (authorId === String(user.id) || canDeleteOthersComments);
        const isYou = label === 'You' && user != null;
        const avatarInitialsText = userMenuStyleAvatarInitials(
          isYou ? user.displayName : (member?.displayName ?? ''),
          isYou ? user.username : (member?.email ?? authorId),
        );
        const profileSrc =
          isYou && user.profilePicture != null && user.profilePicture !== ''
            ? user.profilePicture
            : member?.profilePicture != null && member.profilePicture !== ''
              ? member.profilePicture
              : null;

        return (
          <Box
            key={comment.id}
            p="md"
            style={{
              backgroundColor: 'var(--mantine-color-gray-1)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Group justify="space-between" align="flex-start" mb="xs" wrap="nowrap">
              <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <Avatar
                  alt=""
                  size={APP_USER_AVATAR_SIZE}
                  aria-hidden
                  {...(profileSrc != null ? { src: profileSrc } : {})}
                >
                  {avatarInitialsText}
                </Avatar>
                <Group gap={6} align="baseline" wrap="wrap" style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate="end">
                    {label}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {commentTimestampFormatter.format(new Date(comment.createdAt))}
                  </Text>
                </Group>
              </Group>
              {canDelete ? (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => onDeleteComment(comment.id)}
                  disabled={loading}
                >
                  Delete
                </Button>
              ) : null}
            </Group>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</Text>
          </Box>
        );
      })}
    </Stack>
  );
});

interface CommentDraftComposerProps {
  readonly loading: boolean;
  readonly onSubmit: (trimmedText: string) => Promise<boolean>;
}

function CommentDraftComposer({ loading, onSubmit }: CommentDraftComposerProps) {
  const [draft, setDraft] = useState('');

  const handleSave = async (): Promise<void> => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      return;
    }
    const ok = await onSubmit(trimmed);
    if (ok) {
      setDraft('');
    }
  };

  return (
    <Stack gap="xs">
      <Textarea
        placeholder="Write a comment..."
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        rows={3}
        disabled={loading}
      />
      <Group justify="flex-end" wrap="nowrap" w="100%">
        <Button
          size="xs"
          color="blue"
          style={{ width: 'fit-content' }}
          onClick={() => {
            void handleSave();
          }}
          disabled={loading || !draft.trim()}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}

interface CommentSectionProps {
  card: CardDB;
  boardId: string;
  canCreateComments: boolean;
  canDeleteOthersComments: boolean;
  onCardUpdate: (card: CardDB) => void;
}

export function CommentSection({
  card,
  boardId,
  canCreateComments,
  canDeleteOthersComments,
  onCardUpdate,
}: CommentSectionProps) {
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [boardMembers, setBoardMembers] = useState<BoardMemberUserDisplay[]>([]);

  useEffect(() => {
    const ac = new AbortController();

    const loadBoardMembers = async (): Promise<void> => {
      try {
        const members = await loadBoardMemberUsersForDisplay(boardId, ac.signal);
        if (!ac.signal.aborted) {
          setBoardMembers(members);
        }
      } catch (error) {
        if (isAbortOrCancelError(error)) {
          return;
        }
        console.error('Error loading board members:', error);
      }
    };

    void loadBoardMembers();
    return () => ac.abort();
  }, [boardId]);

  const memberById = useMemo(() => {
    const m = new Map<string, BoardMemberUserDisplay>();
    for (const u of boardMembers) {
      m.set(String(u._id), u);
    }
    return m;
  }, [boardMembers]);

  const handleCreateComment = useCallback(
    async (trimmedText: string): Promise<boolean> => {
      setLoading(true);
      try {
        const response = await api.createComment({
          cardId: card.id,
          text: trimmedText,
        });
        const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
        onCardUpdate(updatedCard);
        return true;
      } catch (error) {
        console.error('Error creating comment:', error);
        notifications.show({
          color: 'red',
          title: 'Could not save comment',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [card.id, onCardUpdate],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      modals.openConfirmModal({
        title: 'Delete comment',
        children: <Text size="sm">Delete this comment?</Text>,
        labels: { confirm: 'Delete', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          setLoading(true);
          try {
            await api.deleteComment(commentId, card.id);
            const response = await api.getCard(card.id);
            const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
            onCardUpdate(updatedCard);
          } catch (error) {
            console.error('Error deleting comment:', error);
            notifications.show({
              color: 'red',
              title: 'Could not delete comment',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          } finally {
            setLoading(false);
          }
        },
      });
    },
    [card.id, onCardUpdate],
  );

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap">
        <IconMessageCircle size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
        <Text {...cardDetailSectionTitleProps}>Comments</Text>
      </Group>

      <CommentThreadList
        comments={card.comments}
        memberById={memberById}
        user={user}
        loading={loading}
        canDeleteOthersComments={canDeleteOthersComments}
        onDeleteComment={handleDeleteComment}
      />

      {canCreateComments ? (
        <CommentDraftComposer loading={loading} onSubmit={handleCreateComment} />
      ) : null}
    </Stack>
  );
}
