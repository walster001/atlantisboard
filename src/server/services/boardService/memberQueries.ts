import { User } from '../../models/User.js';
import { getBoardById } from './queries.js';
import { decodeCursor, encodeCursor, extractRefUserIdString } from './helpers.js';
import type { BoardMemberListItem, BoardMemberListResult } from './types.js';

export async function getBoardMembersPage(
  boardId: string,
  userId: string,
  options?: {
    q?: string;
    sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
    cursor?: string;
    limit?: number;
  },
): Promise<BoardMemberListResult | null> {
  const board = await getBoardById(boardId, userId, { view: 'detail' });
  if (!board || !('_id' in board)) {
    return null;
  }

  const ownerUserId = extractRefUserIdString(board.ownerId);
  const memberUserIds = board.members.map((member) => extractRefUserIdString(member.userId));
  const allUserIds = Array.from(new Set([ownerUserId, ...memberUserIds].filter((id) => id !== '')));
  const users = await User.find({ _id: { $in: allUserIds } })
    .select('_id displayName email profilePicture isPlaceholder placeholderEmail')
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  let rows: BoardMemberListItem[] = [
    (() => {
      const owner = byId.get(ownerUserId);
      const ownerPlaceholder = owner?.isPlaceholder === true;
      return {
        userId: ownerUserId,
        displayName: owner?.displayName ?? 'Unknown user',
        email: owner?.placeholderEmail ?? owner?.email ?? '',
        ...(owner?.profilePicture !== undefined ? { profilePicture: owner.profilePicture } : {}),
        role: 'owner' as const,
        roleKey: 'admin',
        ...(ownerPlaceholder ? { importPlaceholder: true, importNotMapped: true } : {}),
      };
    })(),
    ...board.members
      .filter((member) => extractRefUserIdString(member.userId) !== ownerUserId)
      .map((member) => {
        const id = extractRefUserIdString(member.userId);
        const user = id !== '' ? byId.get(id) : undefined;
        const memberPlaceholder = user?.isPlaceholder === true;
        return {
          userId: id,
          displayName: user?.displayName ?? 'Unknown user',
          email: user?.placeholderEmail ?? user?.email ?? '',
          ...(user?.profilePicture !== undefined ? { profilePicture: user.profilePicture } : {}),
          role: 'member' as const,
          roleKey: member.roleKey,
          addedAt: member.addedAt,
          ...(memberPlaceholder ? { importPlaceholder: true, importNotMapped: true } : {}),
        };
      }),
  ];

  const q = options?.q?.trim().toLowerCase();
  if (q !== undefined && q !== '') {
    rows = rows.filter(
      (row) => row.displayName.toLowerCase().includes(q) || row.email.toLowerCase().includes(q),
    );
  }

  const sort = options?.sort ?? 'displayName:asc';
  rows.sort((a, b) => {
    const [field, dir] = sort.split(':') as ['displayName' | 'email', 'asc' | 'desc'];
    const base =
      field === 'email'
        ? a.email.localeCompare(b.email, undefined, { sensitivity: 'base' })
        : a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    if (base !== 0) {
      return dir === 'desc' ? -base : base;
    }
    return a.userId.localeCompare(b.userId);
  });

  const start = decodeCursor(options?.cursor);
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const end = start + limit;
  const page = rows.slice(start, end);
  return {
    members: page,
    ...(end < rows.length ? { nextCursor: encodeCursor(end) } : {}),
  };
}
