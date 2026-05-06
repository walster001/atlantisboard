import { useMemo } from 'react';
import { Avatar, Badge, Box, Group, Text, Tooltip } from '@mantine/core';
import { format } from 'date-fns';
import { IconCalendarEvent, IconClock, IconFlag } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import type { BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';

interface KanbanLabelRowProps {
  readonly labels: CardDB['labels'];
}

export function KanbanLabelRow({ labels }: KanbanLabelRowProps) {
  const key = useMemo(() => labels.map((l) => `${l.id}:${l.color}:${l.name}`).join('|'), [labels]);
  return useMemo(() => {
    if (labels.length === 0) {
      return null;
    }
    return (
      <Group gap={6} wrap="wrap" mb="xs" className="board-card__kanban-labels">
        {labels.map((label) => (
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
  }, [key, labels]);
}

interface KanbanAssigneeRowProps {
  readonly assignees: CardDB['assignees'];
  readonly assigneeDirectory?: ReadonlyMap<string, BoardMemberUserDisplay>;
}

export function KanbanAssigneeRow({ assignees, assigneeDirectory }: KanbanAssigneeRowProps) {
  const key = useMemo(() => assignees.map(String).join('\0'), [assignees]);
  return useMemo(() => {
    if (assignees.length === 0) {
      return null;
    }
    const totalAssignees = assignees.length;
    const useOverflowAvatar = totalAssignees > 4;
    const visibleAssignees = useOverflowAvatar ? assignees.slice(0, 3) : assignees;
    const overflowCount = totalAssignees - visibleAssignees.length;
    return (
      <Group gap={6} mt="xs" wrap="nowrap">
        {visibleAssignees.map((userId) => {
          const uid = String(userId);
          const u = assigneeDirectory?.get(uid);
          const displayName = u?.displayName?.trim() !== '' ? u?.displayName : uid;
          const email = u?.email?.trim() !== '' ? u?.email : 'No email';
          const src = u?.profilePicture != null && u.profilePicture !== '' ? u.profilePicture : null;
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
              <Avatar size={APP_USER_AVATAR_SIZE} {...(src != null ? { src } : {})}>
                {userMenuStyleAvatarInitials(u?.displayName ?? '', u?.email ?? uid)}
              </Avatar>
            </Tooltip>
          );
        })}
        {useOverflowAvatar ? <Avatar size={APP_USER_AVATAR_SIZE}>{`+${overflowCount}`}</Avatar> : null}
      </Group>
    );
  }, [key, assignees, assigneeDirectory]);
}

interface KanbanDateBadgesRowProps {
  readonly card: CardDB;
  readonly showStartDateOnCards: boolean;
  readonly showDueDateOnCards: boolean;
  readonly showEndDateOnCards: boolean;
}

function dueBadgeStyles(hasCardColor: boolean) {
  if (hasCardColor) {
    return {
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
    } as const;
  }
  return {
    root: {
      fontSize: '0.6875rem',
      fontWeight: 400,
      lineHeight: 1.3,
      minHeight: '1.125rem',
      paddingInline: 6,
    },
    label: { fontSize: 'inherit', fontWeight: 'inherit' },
  } as const;
}

export function KanbanDateBadgesRow({
  card,
  showStartDateOnCards,
  showDueDateOnCards,
  showEndDateOnCards,
}: KanbanDateBadgesRowProps) {
  const hasCardColor = typeof card.color === 'string' && card.color.trim().length > 0;
  const styles = dueBadgeStyles(hasCardColor);
  if (
    (!showStartDateOnCards || card.startDate == null) &&
    (!showDueDateOnCards || card.dueDate == null) &&
    (!showEndDateOnCards || card.endDate == null)
  ) {
    return null;
  }
  return (
    <Group gap={6} mt={6} wrap="wrap" className="board-card__kanban-due-wrap">
      {showStartDateOnCards && card.startDate != null ? (
        <Badge
          size="xs"
          radius={4}
          variant={hasCardColor ? 'filled' : 'light'}
          color="gray"
          leftSection={<IconCalendarEvent size={11} stroke={1.5} aria-hidden />}
          className="board-card__kanban-due"
          styles={styles}
        >
          {format(new Date(card.startDate), 'MMM d')}
        </Badge>
      ) : null}
      {showDueDateOnCards && card.dueDate != null ? (
        <Badge
          size="xs"
          radius={4}
          variant={hasCardColor ? 'filled' : 'light'}
          color="gray"
          leftSection={<IconClock size={11} stroke={1.5} aria-hidden />}
          className="board-card__kanban-due"
          styles={styles}
        >
          {format(new Date(card.dueDate), 'MMM d')}
        </Badge>
      ) : null}
      {showEndDateOnCards && card.endDate != null ? (
        <Badge
          size="xs"
          radius={4}
          variant={hasCardColor ? 'filled' : 'light'}
          color="gray"
          leftSection={<IconFlag size={11} stroke={1.5} aria-hidden />}
          className="board-card__kanban-due"
          styles={styles}
        >
          {format(new Date(card.endDate), 'MMM d')}
        </Badge>
      ) : null}
    </Group>
  );
}
