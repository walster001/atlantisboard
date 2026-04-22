import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { Stack, Text, Button, Badge, Checkbox, Popover, Group, Avatar, ActionIcon, Box } from '@mantine/core';
import { IconUserCircle, IconX } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { api } from '../../utils/api.js';
import { loadBoardMemberUsersForDisplay, type BoardMemberUserDisplay } from '../../utils/loadBoardMemberUsersForDisplay.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import '../board/boardMemberManagement.css';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';

/** Matches `BoardMemberManagement` member rows for consistent picker height. */
const BOARD_MEMBER_TABLE_ROW_PX = 80;

interface AssigneePending {
  readonly adds: Set<string>;
  readonly removes: Set<string>;
}

function emptyAssigneePending(): AssigneePending {
  return { adds: new Set(), removes: new Set() };
}

function isAssigneeEffective(
  userId: string,
  cardAssignees: readonly string[],
  pending: AssigneePending,
): boolean {
  if (pending.removes.has(userId)) {
    return false;
  }
  if (pending.adds.has(userId)) {
    return true;
  }
  return cardAssignees.includes(userId);
}

function flipAssigneePending(
  prev: AssigneePending,
  userId: string,
  cardAssignees: readonly string[],
): AssigneePending {
  const adds = new Set(prev.adds);
  const removes = new Set(prev.removes);
  const effective = isAssigneeEffective(userId, cardAssignees, prev);
  if (effective) {
    removes.add(userId);
    adds.delete(userId);
  } else {
    adds.add(userId);
    removes.delete(userId);
  }
  return { adds, removes };
}

function isAbortOrCancelError(error: unknown): boolean {
  return (
    (isAxiosError(error) && (error.code === 'ERR_CANCELED' || error.name === 'CanceledError')) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function compareMembersByDisplayName(a: BoardMemberUserDisplay, b: BoardMemberUserDisplay): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) {
    return byName;
  }
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

interface AssigneeSectionProps {
  card: CardDB;
  boardId: string;
  onCardUpdate: (card: CardDB) => void;
}

export function AssigneeSection({ card, boardId, onCardUpdate }: AssigneeSectionProps) {
  const [boardMembers, setBoardMembers] = useState<BoardMemberUserDisplay[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [memberFilterQuery, setMemberFilterQuery] = useState('');
  const [assigneePending, setAssigneePending] = useState<AssigneePending>(() => emptyAssigneePending());
  const assigneeToggleInFlightRef = useRef<Set<string>>(new Set());

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

  const handleAssignPickerOpenChange = useCallback((opened: boolean) => {
    setShowAssignPicker(opened);
    if (!opened) {
      setMemberFilterQuery('');
    }
  }, []);

  const assigneeMembershipKey = useMemo(
    () => [...card.assignees].sort((a, b) => a.localeCompare(b)).join('\0'),
    [card.assignees],
  );

  useEffect(() => {
    setAssigneePending((prev) => {
      let changed = false;
      const adds = new Set(prev.adds);
      const removes = new Set(prev.removes);
      for (const id of prev.adds) {
        if (card.assignees.includes(id)) {
          adds.delete(id);
          changed = true;
        }
      }
      for (const id of prev.removes) {
        if (!card.assignees.includes(id)) {
          removes.delete(id);
          changed = true;
        }
      }
      if (!changed) {
        return prev;
      }
      return { adds, removes };
    });
  }, [assigneeMembershipKey]);

  const sortedMembers = useMemo(
    () => [...boardMembers].sort(compareMembersByDisplayName),
    [boardMembers],
  );

  const filteredMembers = useMemo(() => {
    const q = memberFilterQuery.trim().toLowerCase();
    if (q === '') {
      return sortedMembers;
    }
    return sortedMembers.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [sortedMembers, memberFilterQuery]);

  const displayAssigneeIds = useMemo(() => {
    const s = new Set(card.assignees);
    for (const id of assigneePending.removes) {
      s.delete(id);
    }
    for (const id of assigneePending.adds) {
      s.add(id);
    }
    return [...s];
  }, [assigneeMembershipKey, assigneePending]);

  const handleToggleAssignee = async (userId: string) => {
    if (assigneeToggleInFlightRef.current.has(userId)) {
      return;
    }
    assigneeToggleInFlightRef.current.add(userId);
    setAssigneePending((prev) => flipAssigneePending(prev, userId, card.assignees));

    try {
      const isAssigned = card.assignees.includes(userId);
      if (isAssigned) {
        await api.removeCardAssignee(card.id, userId);
      } else {
        await api.addCardAssignee(card.id, userId);
      }

      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
      onCardUpdate(updatedCard);
    } catch (error) {
      console.error('Error toggling assignee:', error);
      setAssigneePending(emptyAssigneePending());
    } finally {
      assigneeToggleInFlightRef.current.delete(userId);
    }
  };

  const getAssignedUser = (userId: string): BoardMemberUserDisplay | undefined => {
    return boardMembers.find((m) => m._id === userId);
  };

  return (
    <Stack gap="md" align="flex-start">
      <Group gap="xs" wrap="nowrap">
        <IconUserCircle size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
        <Text {...cardDetailSectionTitleProps}>Assignees</Text>
      </Group>
      <Popover
        opened={showAssignPicker}
        onChange={handleAssignPickerOpenChange}
        position="bottom-start"
        shadow="md"
        zIndex={520}
        withinPortal
        styles={{
          dropdown: {
            width: 'min(560px, calc(100vw - 24px))',
            maxWidth: 'min(560px, calc(100vw - 24px))',
          },
        }}
      >
        <Popover.Target>
          <Button
            size="sm"
            variant="default"
            styles={cardDetailSoftButtonStyles}
            onClick={() => handleAssignPickerOpenChange(!showAssignPicker)}
          >
            {displayAssigneeIds.length > 0 ? 'Add assignees' : 'Add assignee'}
          </Button>
        </Popover.Target>

        <Popover.Dropdown p="md">
          <Stack gap="md" style={{ minWidth: 0 }}>
            <Text fw={700} size="md">
              Assign to
            </Text>
            <BoardMemberEnterToSearchField
              key={`assign-${boardId}`}
              ariaLabel="Search members to assign"
              placeholder="Search members..."
              onCommit={setMemberFilterQuery}
            />
            <Box
              className="board-member-management__table-scroll"
              style={{
                maxHeight: 360,
                marginTop: 0,
                overflow: 'auto',
              }}
            >
              {filteredMembers.length === 0 ? (
                <Text size="sm" c="dimmed" p="md" ta="center">
                  {boardMembers.length === 0
                    ? 'No members available. Add members to the board first.'
                    : memberFilterQuery.trim() === ''
                      ? 'No members to show.'
                      : 'No members match your search.'}
                </Text>
              ) : (
                <table
                  className="board-member-management__data-table"
                  style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}
                >
                  <colgroup>
                    <col />
                    <col style={{ width: 52 }} />
                  </colgroup>
                  <tbody>
                    {filteredMembers.map((member) => {
                      const isAssigned = isAssigneeEffective(member._id, card.assignees, assigneePending);
                      return (
                        <tr
                          key={member._id}
                          style={{
                            height: BOARD_MEMBER_TABLE_ROW_PX,
                            boxSizing: 'border-box',
                          }}
                        >
                          <td
                            className="board-member-management__td board-member-management__td--user"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              void handleToggleAssignee(member._id);
                            }}
                          >
                            <Group gap="sm" wrap="nowrap" align="center">
                              <Avatar
                                size={APP_USER_AVATAR_SIZE}
                                color="gray"
                                {...(member.profilePicture != null && member.profilePicture !== ''
                                  ? { src: member.profilePicture }
                                  : {})}
                              >
                                {userMenuStyleAvatarInitials(member.displayName, member.email)}
                              </Avatar>
                              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={600} size="sm" lineClamp={1}>
                                  {member.displayName}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={1} style={{ wordBreak: 'break-all' }}>
                                  {member.email}
                                </Text>
                              </Stack>
                            </Group>
                          </td>
                          <td
                            className="board-member-management__td"
                            style={{ textAlign: 'center', verticalAlign: 'middle', width: 52 }}
                          >
                            <Checkbox
                              checked={isAssigned}
                              onChange={() => {
                                void handleToggleAssignee(member._id);
                              }}
                              aria-label={
                                isAssigned ? `Remove ${member.displayName} from assignees` : `Assign ${member.displayName}`
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {displayAssigneeIds.length > 0 ? (
        <Group
          gap="xs"
          mb="xs"
          wrap="wrap"
          style={{ alignSelf: 'stretch', width: '100%' }}
        >
          {displayAssigneeIds.map((assigneeId) => {
            const user = getAssignedUser(assigneeId);
            return (
              <Badge
                key={assigneeId}
                size="lg"
                variant="outline"
                styles={{
                  root: {
                    cursor: 'pointer',
                    height: 'auto',
                    minHeight: 44,
                    paddingInline: 10,
                    paddingBlock: 8,
                    alignItems: 'center',
                  },
                  label: {
                    textTransform: 'none',
                    fontWeight: 500,
                  },
                }}
                leftSection={
                  <Avatar
                    size={APP_USER_AVATAR_SIZE}
                    {...(user?.profilePicture != null && user.profilePicture !== ''
                      ? { src: user.profilePicture }
                      : {})}
                  >
                    {userMenuStyleAvatarInitials(user?.displayName ?? '', user?.email ?? assigneeId)}
                  </Avatar>
                }
                rightSection={
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggleAssignee(assigneeId);
                    }}
                    aria-label={`Remove ${user?.displayName ?? 'assignee'}`}
                  >
                    <IconX size={14} stroke={1.5} />
                  </ActionIcon>
                }
                onClick={() => {
                  void handleToggleAssignee(assigneeId);
                }}
              >
                {user?.displayName || 'Unknown'}
              </Badge>
            );
          })}
        </Group>
      ) : null}
    </Stack>
  );
}
