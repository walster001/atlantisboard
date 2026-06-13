import {
  forwardRef,
  memo,
  type ComponentPropsWithoutRef,
} from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import {
  MEMBER_MOBILE_AVATAR_PX,
  MEMBER_TABLE_ROW_PX,
} from '../members/shared/memberTableConstants.js';
import { MemberUserIdentityStack } from '../members/shared/MemberUserIdentityStack.js';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import {
  APP_ADMIN_ASSIGN_PERMISSION_KEY,
  PERMISSION_DESCRIPTIONS,
} from '../../../shared/permissions/catalog.js';
import type { AppAdminUserRow } from './appAdminMemberTypes.js';

const APP_ADMIN_ASSIGN_DESCRIPTION =
  PERMISSION_DESCRIPTIONS[APP_ADMIN_ASSIGN_PERMISSION_KEY] ?? 'Grant or revoke App Admin to a user.';

export const TABLE_ROW_PX_DESKTOP = MEMBER_TABLE_ROW_PX;
export const TABLE_ROW_PX_MOBILE = 80;
const DESKTOP_ACTION_COL_PX = 108;
const DESKTOP_ROLE_COL_PX = 108;
const MOBILE_ACTION_COL_PX = 48;

export function createAppAdminTableComponents(options: {
  readonly compactLayout: boolean;
  readonly includeRoleColumn: boolean;
}): {
  Table: ReturnType<typeof forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>>;
  TableRow: ReturnType<typeof forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>>;
} {
  const { compactLayout, includeRoleColumn } = options;
  const rowPx = compactLayout ? TABLE_ROW_PX_MOBILE : TABLE_ROW_PX_DESKTOP;
  const actionColPx = compactLayout ? MOBILE_ACTION_COL_PX : DESKTOP_ACTION_COL_PX;

  const Table = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
    ({ style, className, children, ...props }, ref) => (
      <table
        ref={ref}
        {...props}
        className={['board-member-management__data-table', className].filter(Boolean).join(' ')}
        style={{
          width: '100%',
          maxWidth: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          ...style,
        }}
      >
        <colgroup>
          <col />
          {includeRoleColumn ? <col style={{ width: DESKTOP_ROLE_COL_PX }} /> : null}
          <col style={{ width: actionColPx }} />
        </colgroup>
        {children}
      </table>
    ),
  );
  Table.displayName = 'AppAdminDataTable';

  const TableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
    ({ style, ...rest }, ref) => (
      <tr
        {...rest}
        ref={ref}
        style={{
          ...style,
          height: rowPx,
          boxSizing: 'border-box',
        }}
      />
    ),
  );
  TableRow.displayName = 'AppAdminDataTableRow';

  return { Table, TableRow };
}

const AppAdminUserIdentityStack = memo(function AppAdminUserIdentityStack(props: {
  readonly user: AppAdminUserRow;
  readonly compact?: boolean;
  readonly showAdminBadge?: boolean;
}) {
  const { user, compact = false, showAdminBadge = false } = props;
  if (!showAdminBadge) {
    return (
      <MemberUserIdentityStack
        user={user}
        compact={compact}
        showImportBadges={false}
        emailClassName="board-member-management__email-text"
      />
    );
  }
  const email = user.email.trim();
  return (
    <Stack gap={compact ? 2 : 0} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Text fw={600} size={compact ? 'xs' : 'sm'} lineClamp={compact ? 2 : 1} style={{ flex: 1, minWidth: 0 }}>
          {user.displayName}
        </Text>
        <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
          Admin
        </Badge>
      </Group>
      <Tooltip label={email} disabled={email === ''} openDelay={350} position="top-start" multiline maw={420}>
        <Text
          component="span"
          size="xs"
          c="dimmed"
          lineClamp={compact ? 2 : 2}
          className="board-member-management__email-text"
        >
          {user.email}
        </Text>
      </Tooltip>
    </Stack>
  );
});

export const DirectoryUserTableCells = memo(function DirectoryUserTableCells(props: {
  readonly user: AppAdminUserRow;
  readonly compactLayout: boolean;
  readonly onAdd: (user: AppAdminUserRow) => void;
}) {
  const { user, compactLayout, onAdd } = props;
  const avatarSize = compactLayout ? MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={compactLayout ? 0 : 2}
            {...(user.profilePicture != null && user.profilePicture !== ''
              ? { src: user.profilePicture }
              : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <AppAdminUserIdentityStack user={user} compact={compactLayout} />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {compactLayout ? (
          <Tooltip label={APP_ADMIN_ASSIGN_DESCRIPTION}>
            <ActionIcon
              size="lg"
              radius="md"
              color="blue"
              variant="light"
              aria-label="Add as App Admin"
              onClick={() => {
                onAdd(user);
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
              onAdd(user);
            }}
          >
            Add
          </Button>
        )}
      </td>
    </>
  );
});

export const AppAdminUserTableCells = memo(function AppAdminUserTableCells(props: {
  readonly user: AppAdminUserRow;
  readonly compactLayout: boolean;
  readonly canRemove: boolean;
  readonly blockSelfBootstrap: boolean;
  readonly onRemove: (user: AppAdminUserRow) => void;
}) {
  const { user, compactLayout, canRemove, blockSelfBootstrap, onRemove } = props;
  const avatarSize = compactLayout ? MEMBER_MOBILE_AVATAR_PX : APP_USER_AVATAR_SIZE;
  const blockedTooltip = blockSelfBootstrap
    ? 'The bootstrap App Admin cannot remove their own access. Add another App Admin first, then they can remove you if needed.'
    : 'At least one App Admin must remain.';

  return (
    <>
      <td className="board-member-management__td board-member-management__td--user">
        <Group gap={compactLayout ? 6 : 'sm'} wrap="nowrap" align="flex-start">
          <Avatar
            size={avatarSize}
            color="gray"
            mt={compactLayout ? 0 : 2}
            {...(user.profilePicture != null && user.profilePicture !== ''
              ? { src: user.profilePicture }
              : {})}
          >
            {userMenuStyleAvatarInitials(user.displayName, user.email)}
          </Avatar>
          <AppAdminUserIdentityStack user={user} compact={compactLayout} showAdminBadge={compactLayout} />
        </Group>
      </td>
      {compactLayout ? null : (
        <td className="board-member-management__td board-member-management__td--role">
          <Badge size="sm" variant="light" color="blue">
            App Admin
          </Badge>
        </td>
      )}
      <td className="board-member-management__td board-member-management__td--action">
        {canRemove ? (
          compactLayout ? (
            <Tooltip label="Remove App Admin">
              <ActionIcon
                size="lg"
                radius="md"
                color="red"
                variant="light"
                aria-label="Remove App Admin"
                onClick={() => {
                  onRemove(user);
                }}
              >
                <IconUserMinus size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconUserMinus size={14} stroke={2} />}
              onClick={() => {
                onRemove(user);
              }}
            >
              Remove
            </Button>
          )
        ) : compactLayout ? (
          <Tooltip label={blockedTooltip} position="left" maw={280} multiline>
            <ActionIcon
              size="lg"
              radius="md"
              color="gray"
              variant="subtle"
              aria-label={blockedTooltip}
              disabled
            >
              <IconUserMinus size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label={blockedTooltip} position="left" maw={280} multiline>
            <span />
          </Tooltip>
        )}
      </td>
    </>
  );
});
