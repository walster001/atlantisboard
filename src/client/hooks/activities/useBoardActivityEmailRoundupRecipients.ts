import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import {
  compareUserRowsByDisplayName,
  memberUserMatchesQuery,
  sortDirectoryUserRows,
  type MemberUserRow,
} from '../members/memberDirectoryUtils.js';
import { useMemberDirectorySearch } from '../members/useMemberDirectorySearch.js';
import { api } from '../../utils/api.js';
import {
  BOARD_MEMBERS_LIST_PAGE_LIMIT,
  type BoardMemberListItem,
} from '../../components/board/BoardMemberTableParts.js';

function memberRowToUserRow(member: BoardMemberListItem): MemberUserRow {
  return {
    _id: member.userId,
    displayName: member.displayName,
    email: member.email,
    ...(member.profilePicture !== undefined ? { profilePicture: member.profilePicture } : {}),
    ...(member.importPlaceholder === true ? { importPlaceholder: true } : {}),
    ...(member.importNotMapped === true ? { importNotMapped: true } : {}),
  };
}

function placeholderRecipientRow(userId: string): MemberUserRow {
  return { _id: userId, displayName: 'Unknown user', email: '' };
}

export function useBoardActivityEmailRoundupRecipients(
  boardId: string,
  recipientUserIds: readonly string[],
  onRecipientIdsChange: (ids: readonly string[]) => Promise<void>,
  canEdit: boolean,
) {
  const recipientIdSet = useMemo(() => new Set(recipientUserIds), [recipientUserIds]);
  const [recipients, setRecipients] = useState<MemberUserRow[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [memberCandidates, setMemberCandidates] = useState<MemberUserRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [recipientFilterQuery, setRecipientFilterQuery] = useState('');

  const {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    setDirectoryUsers,
    directoryLoading,
    directoryLoadingMore,
    handleDirectoryEndReached,
  } = useMemberDirectorySearch<MemberUserRow>({
    scope: 'board',
    scopeId: boardId,
    mapUsers: (users) => users as MemberUserRow[],
  });

  const recipientIdsRef = useRef(recipientUserIds);
  recipientIdsRef.current = recipientUserIds;

  const resolveRecipients = useCallback(async (ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) {
      setRecipients([]);
      return;
    }
    setRecipientsLoading(true);
    try {
      const idSet = new Set(ids);
      const resolved = new Map<string, MemberUserRow>();
      let cursor: string | undefined;
      do {
        const response = await api.getBoardMembers(boardId, {
          sort: 'displayName:asc',
          limit: BOARD_MEMBERS_LIST_PAGE_LIMIT,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        const rows = (response.members as BoardMemberListItem[]) ?? [];
        for (const row of rows) {
          if (idSet.has(row.userId)) {
            resolved.set(row.userId, memberRowToUserRow(row));
          }
        }
        cursor = response.nextCursor;
      } while (cursor !== undefined && resolved.size < ids.length);

      const ordered = ids.map((id) => resolved.get(id) ?? placeholderRecipientRow(id));
      setRecipients(sortDirectoryUserRows(ordered));
    } catch (error) {
      console.error('Error resolving email roundup recipients:', error);
      setRecipients(sortDirectoryUserRows(ids.map((id) => placeholderRecipientRow(id))));
    } finally {
      setRecipientsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void resolveRecipients(recipientUserIds);
  }, [recipientUserIds, resolveRecipients]);

  const loadMemberCandidates = useCallback(async (): Promise<void> => {
    setMembersLoading(true);
    try {
      const collected: MemberUserRow[] = [];
      const exclude = recipientIdsRef.current;
      const excludeSet = new Set(exclude);
      let cursor: string | undefined;
      do {
        const response = await api.getBoardMembers(boardId, {
          sort: 'displayName:asc',
          limit: BOARD_MEMBERS_LIST_PAGE_LIMIT,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        const rows = (response.members as BoardMemberListItem[]) ?? [];
        for (const row of rows) {
          if (!excludeSet.has(row.userId)) {
            collected.push(memberRowToUserRow(row));
          }
        }
        cursor = response.nextCursor;
      } while (cursor !== undefined);
      setMemberCandidates(sortDirectoryUserRows(collected));
    } catch (error) {
      console.error('Error loading board members for roundup picker:', error);
      setMemberCandidates([]);
    } finally {
      setMembersLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void loadMemberCandidates();
  }, [loadMemberCandidates, recipientUserIds]);

  const filteredDirectoryUsers = useMemo(
    () => directoryUsers.filter((user) => !recipientIdSet.has(user._id)),
    [directoryUsers, recipientIdSet],
  );

  const filteredMemberCandidates = useMemo(() => {
    const q = directoryQuery.trim();
    return memberCandidates.filter((user) => memberUserMatchesQuery(user, q));
  }, [memberCandidates, directoryQuery]);

  const availableUsers = useMemo(() => {
    const seen = new Set<string>();
    const merged: MemberUserRow[] = [];
    for (const user of filteredMemberCandidates) {
      if (!seen.has(user._id)) {
        seen.add(user._id);
        merged.push(user);
      }
    }
    for (const user of filteredDirectoryUsers) {
      if (!seen.has(user._id)) {
        seen.add(user._id);
        merged.push(user);
      }
    }
    return sortDirectoryUserRows(merged);
  }, [filteredMemberCandidates, filteredDirectoryUsers]);

  const filteredRecipients = useMemo(() => {
    if (recipientFilterQuery.trim() === '') {
      return [...recipients].sort(compareUserRowsByDisplayName);
    }
    return recipients
      .filter((user) => memberUserMatchesQuery(user, recipientFilterQuery))
      .sort(compareUserRowsByDisplayName);
  }, [recipients, recipientFilterQuery]);

  const directoryLoadingCombined = directoryLoading || membersLoading;

  const persistRecipients = useCallback(
    async (nextIds: readonly string[]): Promise<void> => {
      if (!canEdit) {
        return;
      }
      try {
        await onRecipientIdsChange(nextIds);
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Could not update recipients',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    [canEdit, onRecipientIdsChange],
  );

  const handleAddRecipient = useCallback(
    async (user: MemberUserRow): Promise<void> => {
      if (!canEdit || recipientIdSet.has(user._id)) {
        return;
      }
      const nextIds = [...recipientUserIds, user._id];
      setRecipients((prev) => sortDirectoryUserRows([...prev, user]));
      setMemberCandidates((prev) => prev.filter((u) => u._id !== user._id));
      setDirectoryUsers((prev) => prev.filter((u) => u._id !== user._id));
      try {
        await persistRecipients(nextIds);
      } catch {
        setRecipients((prev) => prev.filter((u) => u._id !== user._id));
        setMemberCandidates((prev) => sortDirectoryUserRows([...prev, user]));
        setDirectoryUsers((prev) => sortDirectoryUserRows([...prev, user]));
      }
    },
    [
      canEdit,
      recipientIdSet,
      recipientUserIds,
      persistRecipients,
      setDirectoryUsers,
    ],
  );

  const handleRemoveRecipient = useCallback(
    async (user: MemberUserRow): Promise<void> => {
      if (!canEdit || !recipientIdSet.has(user._id)) {
        return;
      }
      const nextIds = recipientUserIds.filter((id) => id !== user._id);
      setRecipients((prev) => prev.filter((u) => u._id !== user._id));
      try {
        await persistRecipients(nextIds);
        void loadMemberCandidates();
        setDirectoryUsers((prev) => (prev.some((u) => u._id === user._id) ? prev : sortDirectoryUserRows([...prev, user])));
      } catch {
        setRecipients((prev) => sortDirectoryUserRows([...prev, user]));
      }
    },
    [
      canEdit,
      recipientIdSet,
      recipientUserIds,
      persistRecipients,
      loadMemberCandidates,
      setDirectoryUsers,
    ],
  );

  return {
    directoryQuery,
    setDirectoryQuery,
    recipientFilterQuery,
    setRecipientFilterQuery,
    availableUsers,
    filteredRecipients,
    directoryLoading: directoryLoadingCombined,
    directoryLoadingMore,
    recipientsLoading,
    handleDirectoryEndReached,
    handleAddRecipient,
    handleRemoveRecipient,
    recipientCount: recipientUserIds.length,
  };
}
