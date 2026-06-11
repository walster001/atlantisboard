import type { ReactNode } from 'react';
import { Box, Checkbox, Tooltip } from '@mantine/core';
import type { AdminUserRow, UserCapabilityDraft } from './adminUsersTabUtils.js';
import { CAP_CELL_CLASS, CAP_COL_CLASS } from './adminUsersTabUtils.js';

type CapabilityField = keyof UserCapabilityDraft;

export function renderUserCapabilityCheckbox(
  user: AdminUserRow,
  field: CapabilityField,
  checked: boolean,
  onChange: (userId: string, checked: boolean) => void,
): ReactNode {
  if (user.isAppAdmin) {
    return (
      <Tooltip label="App admins always have this capability." position="top">
        <span>
          <Checkbox checked={true} disabled readOnly aria-label="Always enabled for app admin" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Checkbox
      checked={checked}
      onChange={(event) => onChange(user._id, event.currentTarget.checked)}
      aria-label={field === 'canImportBoards' ? 'Import boards' : 'Create workspace'}
    />
  );
}

export function AdminUsersTableCapabilityCells(props: {
  readonly user: AdminUserRow;
  readonly draft: UserCapabilityDraft;
  readonly tdClass: (extra?: string) => string;
  readonly onImportChange: (userId: string, checked: boolean) => void;
  readonly onCreateWorkspaceChange: (userId: string, checked: boolean) => void;
}) {
  const { user, draft, tdClass, onImportChange, onCreateWorkspaceChange } = props;
  return (
    <>
      <td className={tdClass(CAP_COL_CLASS)}>
        <Box className={CAP_CELL_CLASS}>
          {renderUserCapabilityCheckbox(user, 'canImportBoards', draft.canImportBoards, onImportChange)}
        </Box>
      </td>
      <td className={tdClass(CAP_COL_CLASS)}>
        <Box className={CAP_CELL_CLASS}>
          {renderUserCapabilityCheckbox(
            user,
            'canCreateWorkspace',
            draft.canCreateWorkspace,
            onCreateWorkspaceChange,
          )}
        </Box>
      </td>
    </>
  );
}
