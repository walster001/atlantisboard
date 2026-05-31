import {
  memo,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
} from 'react';
import { Box, Button, Checkbox, Text, Tooltip } from '@mantine/core';
import {
  ADMIN_USER_ACTION_COL_PX,
  ADMIN_USER_CREATE_WS_COL_PX,
  ADMIN_USER_IMPORT_COL_PX,
  ADMIN_USER_ROW_PX,
  CAP_CELL_CLASS,
  CAP_COL_CLASS,
  formatAuthProvider,
  formatDateTime,
  type AdminUserRow,
  type UserCapabilityDraft,
} from './adminUsersTabUtils.js';

export const AdminUsersDataTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
  ({ style, className, children, ...props }, ref) => (
    <table
      ref={ref}
      {...props}
      className={['admin-users-tab__data-table', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        ...style,
      }}
    >
      <colgroup>
        <col style={{ width: ADMIN_USER_IMPORT_COL_PX }} />
        <col style={{ width: ADMIN_USER_CREATE_WS_COL_PX }} />
        <col />
        <col />
        <col style={{ width: 120 }} />
        <col style={{ width: 88 }} />
        <col style={{ width: 168 }} />
        <col style={{ width: 168 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 128 }} />
        <col style={{ width: ADMIN_USER_ACTION_COL_PX }} />
      </colgroup>
      {children}
    </table>
  ),
);
AdminUsersDataTable.displayName = 'AdminUsersDataTable';

export const AdminUsersTableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ style, ...rest }, ref) => (
    <tr
      {...rest}
      ref={ref}
      style={{
        ...style,
        height: ADMIN_USER_ROW_PX,
        boxSizing: 'border-box',
      }}
    />
  ),
);
AdminUsersTableRow.displayName = 'AdminUsersTableRow';

export const adminUsersTableVirtuosoComponents = {
  Table: AdminUsersDataTable,
  TableRow: AdminUsersTableRow,
};

export const AdminUserTableCells = memo(function AdminUserTableCells(props: {
  readonly rowIndex: number;
  readonly user: AdminUserRow;
  readonly draft: UserCapabilityDraft;
  readonly isCurrentUser: boolean;
  readonly onImportChange: (userId: string, checked: boolean) => void;
  readonly onCreateWorkspaceChange: (userId: string, checked: boolean) => void;
  readonly onDeleteClick: (user: AdminUserRow) => void;
}) {
  const {
    rowIndex,
    user,
    draft,
    isCurrentUser,
    onImportChange,
    onCreateWorkspaceChange,
    onDeleteClick,
  } = props;
  const capsDisabled = user.isAppAdmin;
  const striped = rowIndex % 2 === 1;
  const tdClass = (extra?: string): string =>
    ['admin-users-tab__td', striped ? 'admin-users-tab__td--striped' : '', extra].filter(Boolean).join(' ');

  const capabilityCheckbox = (checked: boolean, onChange: (next: boolean) => void): ReactElement => {
    if (capsDisabled) {
      return (
        <Tooltip label="App admins always have this capability." position="top">
          <span>
            <Checkbox checked={true} disabled readOnly aria-label="Always enabled for app admin" />
          </span>
        </Tooltip>
      );
    }
    return <Checkbox checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />;
  };

  const deleteButton = (
    <Button
      size="xs"
      color="red"
      variant="light"
      disabled={isCurrentUser}
      onClick={() => onDeleteClick(user)}
    >
      Delete
    </Button>
  );

  return (
    <>
      <td className={tdClass(CAP_COL_CLASS)}>
        <Box className={CAP_CELL_CLASS}>
          {capabilityCheckbox(draft.canImportBoards, (next) => onImportChange(user._id, next))}
        </Box>
      </td>
      <td className={tdClass(CAP_COL_CLASS)}>
        <Box className={CAP_CELL_CLASS}>
          {capabilityCheckbox(draft.canCreateWorkspace, (next) => onCreateWorkspaceChange(user._id, next))}
        </Box>
      </td>
      <td className={tdClass()}>{user.displayName}</td>
      <td className={tdClass()}>{user.email}</td>
      <td className={tdClass()}>{user.username}</td>
      <td className={tdClass()}>{user.isAppAdmin ? 'Yes' : 'No'}</td>
      <td className={tdClass()}>{formatDateTime(user.createdAt)}</td>
      <td className={tdClass()}>{formatDateTime(user.lastLogin)}</td>
      <td className={tdClass()}>{user.emailVerified ? 'Yes' : 'No'}</td>
      <td className={tdClass()}>{formatAuthProvider(user.authProvider)}</td>
      <td className={tdClass('admin-users-tab__td--actions')}>
        {isCurrentUser ? (
          <Tooltip label="You cannot delete the account currently in use." position="left">
            <span>{deleteButton}</span>
          </Tooltip>
        ) : (
          deleteButton
        )}
      </td>
    </>
  );
});

interface AdminUsersTableHeaderProps {
  readonly importMaster: { readonly checked: boolean; readonly indeterminate: boolean };
  readonly createWorkspaceMaster: { readonly checked: boolean; readonly indeterminate: boolean };
  readonly onMasterImportChange: (checked: boolean) => void;
  readonly onMasterCreateWorkspaceChange: (checked: boolean) => void;
}

export function AdminUsersTableHeader({
  importMaster,
  createWorkspaceMaster,
  onMasterImportChange,
  onMasterCreateWorkspaceChange,
}: AdminUsersTableHeaderProps) {
  return (
    <tr>
      <th className={`admin-users-tab__th ${CAP_COL_CLASS}`}>
        <Box className={CAP_CELL_CLASS}>
          <Text size="sm" fw={600}>
            Import Boards
          </Text>
          <Checkbox
            checked={importMaster.checked}
            indeterminate={importMaster.indeterminate}
            onChange={(event) => {
              onMasterImportChange(event.currentTarget.checked);
            }}
            aria-label="Select all import boards"
          />
        </Box>
      </th>
      <th className={`admin-users-tab__th ${CAP_COL_CLASS}`}>
        <Box className={CAP_CELL_CLASS}>
          <Text size="sm" fw={600}>
            Create workspace
          </Text>
          <Checkbox
            checked={createWorkspaceMaster.checked}
            indeterminate={createWorkspaceMaster.indeterminate}
            onChange={(event) => {
              onMasterCreateWorkspaceChange(event.currentTarget.checked);
            }}
            aria-label="Select all create workspace"
          />
        </Box>
      </th>
      <th className="admin-users-tab__th">Full name</th>
      <th className="admin-users-tab__th">Email</th>
      <th className="admin-users-tab__th">Username</th>
      <th className="admin-users-tab__th">App Admin</th>
      <th className="admin-users-tab__th">Created At</th>
      <th className="admin-users-tab__th">Last Login</th>
      <th className="admin-users-tab__th">Email Verified</th>
      <th className="admin-users-tab__th">Auth Provider</th>
      <th className="admin-users-tab__th admin-users-tab__th--actions">Actions</th>
    </tr>
  );
}
