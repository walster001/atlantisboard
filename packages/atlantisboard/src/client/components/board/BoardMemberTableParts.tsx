import { memo } from 'react';
import {
  ActionIcon,
  Avatar,
  Button,
  Group,
  Select,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import {
  compareUserRowsByDisplayName,
  type MemberUserRow,
} from '../../hooks/members/memberDirectoryUtils.js';
import { defaultMemberTableVirtuosoComponents } from '../members/shared/memberTableVirtuoso.js';
import {
  MEMBER_LIST_OVERSCAN,
  MEMBER_MOBILE_AVATAR_PX,
  MEMBER_TABLE_ROW_PX,
  MEMBER_VIRTUOSO_OVERSCAN,
  MEMBER_VIRTUOSO_VIEWPORT_PAD,
} from '../members/shared/memberTableConstants.js';
import { MemberUserIdentityStack } from '../members/shared/MemberUserIdentityStack.js';
import { builtinRoleSelectOptions, type RoleKey } from '../../../shared/permissions/catalog.js';

export type UserRow = MemberUserRow;

export interface BoardMember {
  userId: string | UserRow;
  roleKey: RoleKey;
}

export interface BoardPayload {
  ownerId?: string | UserRow;
  members?: BoardMember[];
}

export interface BoardMemberListItem {
  userId: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  role: 'owner' | 'member';
  roleKey: string;
  importPlaceholder?: boolean | undefined;
  importNotMapped?: boolean | undefined;
}

export type MemberPanelRow =
  | { readonly kind: 'owner'; readonly user: UserRow }
  | { readonly kind: 'member'; readonly member: BoardMember };

export const BUILTIN_ROLE_OPTIONS = builtinRoleSelectOptions();

/** Server `boardMembersQuerySchema` / `getBoardMembersPage` cap — use full page for fewer round-trips at ~1000 members. */
export const BOARD_MEMBERS_LIST_PAGE_LIMIT = 200;

export const boardMemberTableVirtuosoComponents = defaultMemberTableVirtuosoComponents;

export {
  MEMBER_TABLE_ROW_PX as BOARD_MEMBER_TABLE_ROW_PX,
  MEMBER_MOBILE_AVATAR_PX as BOARD_MEMBER_MOBILE_AVATAR_PX,
  MEMBER_VIRTUOSO_VIEWPORT_PAD as BOARD_MEMBER_VIRTUOSO_VIEWPORT_PAD,
  MEMBER_VIRTUOSO_OVERSCAN as BOARD_MEMBER_VIRTUOSO_OVERSCAN,
  MEMBER_LIST_OVERSCAN as BOARD_MEMBER_CURRENT_LIST_OVERSCAN,
};

export function extractUser(userId: string | UserRow): UserRow {
  if (typeof userId === 'string') {
    return { _id: userId, displayName: '', email: '' };
  }
  return userId;
}

export function sortBoardMembersByDisplayName(members: readonly BoardMember[]): BoardMember[] {
  return [...members].sort((m1, m2) =>
    compareUserRowsByDisplayName(extractUser(m1.userId), extractUser(m2.userId)),
  );
}

export function memberPanelRowMatchesRoleFilter(row: MemberPanelRow, roleFilter: RoleKey): boolean {
  if (row.kind === 'owner') {
    return roleFilter === 'admin';
  }
  return row.member.roleKey === roleFilter;
}

/** Later entries win (newest page / API wins) so pagination merges stay consistent */
export function mergeBoardMembersByUserId(
  existing: readonly BoardMember[],
  incoming: readonly BoardMember[],
): BoardMember[] {
  const map = new Map<string, BoardMember>();
  for (const m of existing) {
    map.set(extractUser(m.userId)._id, m);
  }
  for (const m of incoming) {
    map.set(extractUser(m.userId)._id, m);
  }
  return [...map.values()];
}

export const DirectoryUserTableRow = memo(function DirectoryUserTableRow(props: {
  readonly user: UserRow;
  readonly roleKey: RoleKey;
  readonly roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>;
  readonly canAddMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly onRoleChange: (userId: string, next: RoleKey) => void;
  readonly onAddUser: (userId: string) => void;
  readonly compactLayout?: boolean;
}) {
  const {
    user,
    roleKey,
    roleOptions,
    canAddMember,
    canUpdateMemberRole,
    onRoleChange,
    onAddUser,
    compactLayout = false,
  } = props;
  const avatarSize = compactLayout ? MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  const isImportPlaceholder = user.importPlaceholder === true;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            compact={compactLayout}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRole ? (
          <Select
            size="xs"
            w="100%"
            value={roleKey}
            onChange={(v) => {
              if (v) {
                onRoleChange(user._id, v as RoleKey);
              }
            }}
            data={roleOptions}
            comboboxProps={{ withinPortal: false }}
          />
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {isImportPlaceholder ? (
          <Text size="xs" c="dimmed" ta="center">
            On board
          </Text>
        ) : canAddMember ? (
          compactLayout ? (
            <Tooltip label="Add to board">
              <ActionIcon
                size="lg"
                radius="md"
                color="blue"
                variant="light"
                aria-label="Add user to board"
                onClick={() => {
                  onAddUser(user._id);
                }}
              >
                <IconPlus size={18} stroke={2} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              color="blue"
              leftSection={<IconPlus size={14} stroke={2} />}
              onClick={() => {
                onAddUser(user._id);
              }}
            >
              Add
            </Button>
          )
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});

export const OwnerTableCells = memo(function OwnerTableCells(props: {
  readonly user: UserRow;
  readonly compactLayout?: boolean;
}) {
  const { user, compactLayout = false } = props;
  const avatarSize = compactLayout ? MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user board-member-management__td--user-row-owner">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="center">
          <Avatar
            size={avatarSize}
            color="blue"
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            compact={compactLayout}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td
        className="board-member-management__td board-member-management__td--role board-member-management__td--role-owner"
      >
        <Text component="span" size="sm" fw={500} c="dimmed" style={{ lineHeight: 1.45 }}>
          Owner
        </Text>
      </td>
      <td className="board-member-management__td board-member-management__td--action board-member-management__td--action-row-owner" />
    </>
  );
});

export const MemberTableCells = memo(function MemberTableCells(props: {
  readonly user: UserRow;
  readonly roleKey: RoleKey;
  readonly roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>;
  readonly canRemoveMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly onRoleChange: (userId: string, next: RoleKey) => void;
  readonly onRemoveMember: (userId: string) => void;
  readonly compactLayout?: boolean;
}) {
  const {
    user,
    roleKey,
    roleOptions,
    canRemoveMember,
    canUpdateMemberRole,
    onRoleChange,
    onRemoveMember,
    compactLayout = false,
  } = props;
  const avatarSize = compactLayout ? MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            compact={compactLayout}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRole ? (
          <Select
            size="xs"
            w="100%"
            value={roleKey}
            onChange={(v) => {
              if (v) {
                onRoleChange(user._id, v as RoleKey);
              }
            }}
            data={roleOptions}
            comboboxProps={{ withinPortal: false }}
          />
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {canRemoveMember ? (
          compactLayout ? (
            <Tooltip label="Remove from board">
              <ActionIcon
                size="lg"
                radius="md"
                color="red"
                variant="light"
                aria-label="Remove member from board"
                onClick={() => {
                  onRemoveMember(user._id);
                }}
              >
                <IconUserMinus size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconUserMinus size={16} stroke={1.5} />}
              onClick={() => {
                onRemoveMember(user._id);
              }}
            >
              Remove
            </Button>
          )
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});
