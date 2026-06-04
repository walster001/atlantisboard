import type { ReactElement } from 'react';
import { Progress, Stack, Text } from '@mantine/core';

export const CAP_COL_CLASS = 'admin-users-tab__cap-col';
export const CAP_CELL_CLASS = 'admin-users-tab__cap-cell';
export const ADMIN_USER_ROW_PX = 52;
/** Stacked label + checkbox; must fit "Import Boards" without clipping. */
export const ADMIN_USER_IMPORT_COL_PX = 116;
/** Stacked label + checkbox; must fit "Create workspace" without clipping. */
export const ADMIN_USER_CREATE_WS_COL_PX = 152;
export const ADMIN_USER_ACTION_COL_PX = 96;
export const ADMIN_USER_VIRTUOSO_VIEWPORT_PAD = { top: 48, bottom: 120 } as const;
export const ADMIN_USER_VIRTUOSO_OVERSCAN = 10;

export const PAGE_LIMIT = 100;
export const MASTER_DELETE_PROGRESS_NOTIFICATION_ID = 'admin-master-delete-progress';

export interface AdminUserRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly isAppAdmin: boolean;
  readonly createdAt: string;
  readonly lastLogin?: string;
  readonly emailVerified: boolean;
  readonly authProvider: 'password' | 'google' | 'google+password' | 'none';
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}

export interface UserCapabilityDraft {
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}

export function renderMasterDeleteProgressMessage(label: string, value: number): ReactElement {
  return (
    <Stack gap={6}>
      <Text size="sm">{label}</Text>
      <Progress value={value} radius="md" size="sm" />
    </Stack>
  );
}

export function formatDateTime(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString();
}

export function formatAuthProvider(value: AdminUserRow['authProvider']): string {
  switch (value) {
    case 'google+password':
      return 'Google + Password';
    case 'google':
      return 'Google';
    case 'password':
      return 'Password';
    default:
      return 'None';
  }
}

export function draftFromUsers(users: readonly AdminUserRow[]): Record<string, UserCapabilityDraft> {
  const draft: Record<string, UserCapabilityDraft> = {};
  for (const user of users) {
    draft[user._id] = {
      canImportBoards: user.canImportBoards,
      canCreateWorkspace: user.canCreateWorkspace,
    };
  }
  return draft;
}

export function masterCheckboxState(
  users: readonly AdminUserRow[],
  draft: Record<string, UserCapabilityDraft>,
  field: keyof UserCapabilityDraft,
): { readonly checked: boolean; readonly indeterminate: boolean } {
  const editable = users.filter((u) => !u.isAppAdmin);
  if (editable.length === 0) {
    return { checked: false, indeterminate: false };
  }
  let enabledCount = 0;
  for (const user of editable) {
    const row = draft[user._id];
    if (row?.[field] === true) {
      enabledCount += 1;
    }
  }
  if (enabledCount === 0) {
    return { checked: false, indeterminate: false };
  }
  if (enabledCount === editable.length) {
    return { checked: true, indeterminate: false };
  }
  return { checked: false, indeterminate: true };
}
