import { memo } from 'react';
import { Avatar, Button, Group, Select, Text } from '@mantine/core';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import { MemberUserIdentityStack } from '../members/shared/MemberUserIdentityStack.js';
import type { UserRow, WorkspaceMemberRow, WorkspaceRoleKey } from './workspaceMemberTypes.js';

export const WorkspaceMemberPanelOwnerCells = memo(function WorkspaceMemberPanelOwnerCells(props: {
  readonly user: UserRow;
}) {
  const { user } = props;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user board-member-management__td--user-row-owner">
        <Group gap="sm" wrap="nowrap" align="center">
          <Avatar
            size={APP_USER_AVATAR_SIZE}
            color="blue"
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            showImportBadges={false}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role board-member-management__td--role-owner">
        <Text component="span" size="sm" fw={500} c="dimmed" style={{ lineHeight: 1.45 }}>
          Owner
        </Text>
      </td>
      <td className="board-member-management__td board-member-management__td--action board-member-management__td--action-row-owner" />
    </>
  );
});
WorkspaceMemberPanelOwnerCells.displayName = 'WorkspaceMemberPanelOwnerCells';

export const WorkspaceMemberPanelMemberCells = memo(function WorkspaceMemberPanelMemberCells(props: {
  readonly member: WorkspaceMemberRow;
  readonly roleOptions: ReadonlyArray<{ value: WorkspaceRoleKey; label: string }>;
  readonly canRemoveMembers: boolean;
  readonly canUpdateMemberRoles: boolean;
  readonly onRoleChange: (userId: string, roleKey: WorkspaceRoleKey) => void;
  readonly onRemove: (userId: string) => void;
}) {
  const { member, roleOptions, canRemoveMembers, canUpdateMemberRoles, onRoleChange, onRemove } = props;
  const user = member.user;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Avatar
            size={APP_USER_AVATAR_SIZE}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            showImportBadges={false}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRoles ? (
          <Select
            size="xs"
            w="100%"
            value={member.roleKey}
            onChange={(v) => {
              if (!v) return;
              onRoleChange(user._id, v as WorkspaceRoleKey);
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
        {canRemoveMembers ? (
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconUserMinus size={16} stroke={1.5} />}
            onClick={() => {
              onRemove(user._id);
            }}
          >
            Remove
          </Button>
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});
WorkspaceMemberPanelMemberCells.displayName = 'WorkspaceMemberPanelMemberCells';

export const WorkspaceDirectoryUserCells = memo(function WorkspaceDirectoryUserCells(props: {
  readonly user: UserRow;
  readonly role: WorkspaceRoleKey;
  readonly roleOptions: ReadonlyArray<{ value: WorkspaceRoleKey; label: string }>;
  readonly canAdd: boolean;
  readonly canAddMembers: boolean;
  readonly canUpdateMemberRoles: boolean;
  readonly onRoleChange: (userId: string, roleKey: WorkspaceRoleKey) => void;
  readonly onAdd: (userId: string) => void;
}) {
  const {
    user,
    role,
    roleOptions,
    canAdd,
    canAddMembers,
    canUpdateMemberRoles,
    onRoleChange,
    onAdd,
  } = props;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Avatar
            size={APP_USER_AVATAR_SIZE}
            color="gray"
            mt={2}
            {...(user.profilePicture != null && user.profilePicture !== '' ? { src: user.profilePicture } : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <MemberUserIdentityStack
            user={user}
            showImportBadges={false}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--role">
        {canUpdateMemberRoles ? (
          <Select
            size="xs"
            w="100%"
            value={role}
            onChange={(v) => {
              if (!v) return;
              onRoleChange(user._id, v as WorkspaceRoleKey);
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
        {canAddMembers ? (
          <Button
            size="xs"
            color="blue"
            leftSection={<IconPlus size={14} stroke={2} />}
            disabled={!canAdd}
            onClick={() => {
              void onAdd(user._id);
            }}
          >
            Add
          </Button>
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            -
          </Text>
        )}
      </td>
    </>
  );
});
WorkspaceDirectoryUserCells.displayName = 'WorkspaceDirectoryUserCells';
