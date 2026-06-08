import { forwardRef, memo, type ComponentPropsWithoutRef } from 'react';
import {
  ActionIcon,
  Avatar,
  Button,
  Group,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconUserMinus } from '@tabler/icons-react';
import { APP_USER_AVATAR_SIZE } from '../../constants/userAvatar.js';
import { userMenuStyleAvatarInitials } from '../../utils/userMenuStyleAvatarInitials.js';
import type { MemberUserRow } from '../../hooks/members/memberDirectoryUtils.js';
import {
  MEMBER_MOBILE_AVATAR_PX,
  MEMBER_TABLE_ROW_PX,
} from '../members/shared/memberTableConstants.js';
import { MemberUserIdentityStack } from '../members/shared/MemberUserIdentityStack.js';

const DESKTOP_ACTION_COL_PX = 108;
const MOBILE_ACTION_COL_PX = 48;

export function createRoundupTableComponents(options: {
  readonly compactLayout: boolean;
}): {
  Table: ReturnType<typeof forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>>;
  TableRow: ReturnType<typeof forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>>;
} {
  const { compactLayout } = options;
  const rowPx = compactLayout ? 80 : MEMBER_TABLE_ROW_PX;
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
          <col style={{ width: actionColPx }} />
        </colgroup>
        {children}
      </table>
    ),
  );
  Table.displayName = 'RoundupDataTable';

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
  TableRow.displayName = 'RoundupDataTableRow';

  return { Table, TableRow };
}

export const RoundupDirectoryTableCells = memo(function RoundupDirectoryTableCells(props: {
  readonly user: MemberUserRow;
  readonly compactLayout: boolean;
  readonly onAdd: (user: MemberUserRow) => void;
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
          <MemberUserIdentityStack
            user={user}
            compact={compactLayout}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {compactLayout ? (
          <Tooltip label="Add as roundup recipient">
            <ActionIcon
              size="lg"
              radius="md"
              color="blue"
              variant="light"
              aria-label="Add as roundup recipient"
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

export const RoundupRecipientTableCells = memo(function RoundupRecipientTableCells(props: {
  readonly user: MemberUserRow;
  readonly compactLayout: boolean;
  readonly canRemove: boolean;
  readonly onRemove: (user: MemberUserRow) => void;
}) {
  const { user, compactLayout, canRemove, onRemove } = props;
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
          <MemberUserIdentityStack
            user={user}
            compact={compactLayout}
            emailClassName="board-member-management__email-text"
          />
        </Group>
      </td>
      <td className="board-member-management__td board-member-management__td--action">
        {canRemove ? (
          compactLayout ? (
            <Tooltip label="Remove from roundup recipients">
              <ActionIcon
                size="lg"
                radius="md"
                color="red"
                variant="light"
                aria-label="Remove from roundup recipients"
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
        ) : null}
      </td>
    </>
  );
});
