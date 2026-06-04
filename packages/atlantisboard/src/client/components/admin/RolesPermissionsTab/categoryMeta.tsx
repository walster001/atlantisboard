import type { ReactNode } from 'react';
import {
  IconChecklist,
  IconColumns3,
  IconDownload,
  IconLayoutKanbanFilled,
  IconLink,
  IconMessageCircle,
  IconPaperclip,
  IconPalette,
  IconSettings,
  IconTag,
  IconUpload,
  IconUsers,
} from '@tabler/icons-react';
import type { PermissionCategoryKey, CategoryStatus } from './types.js';

export const CATEGORY_ORDER: readonly PermissionCategoryKey[] = [
  'workspaces',
  'boards',
  'board-settings',
  'theme-background',
  'members',
  'columns',
  'cards',
  'labels',
  'attachments',
  'comments',
  'subtasks',
  'invites',
  'import',
  'export',
  'other',
] as const;

export function categoryLabel(key: PermissionCategoryKey): string {
  switch (key) {
    case 'workspaces':
      return 'Workspaces';
    case 'boards':
      return 'Boards';
    case 'board-settings':
      return 'Board Settings';
    case 'theme-background':
      return 'Theme & Background';
    case 'members':
      return 'Members';
    case 'columns':
      return 'Columns';
    case 'cards':
      return 'Cards';
    case 'labels':
      return 'Labels';
    case 'attachments':
      return 'Attachments';
    case 'comments':
      return 'Comments';
    case 'subtasks':
      return 'Checklists';
    case 'invites':
      return 'Invites';
    case 'import':
      return 'Import';
    case 'export':
      return 'Export';
    case 'other':
      return 'Other';
  }
}

function IconToolCompat(props: { readonly size: number; readonly stroke: number }) {
  return <IconSettings size={props.size} stroke={props.stroke} />;
}

export function categoryIcon(key: PermissionCategoryKey): ReactNode {
  const size = 16;
  const stroke = 1.6;
  switch (key) {
    case 'workspaces':
      return <IconUsers size={size} stroke={stroke} />;
    case 'boards':
      return <IconLayoutKanbanFilled size={size} stroke={stroke} />;
    case 'board-settings':
      return <IconSettings size={size} stroke={stroke} />;
    case 'theme-background':
      return <IconPalette size={size} stroke={stroke} />;
    case 'members':
      return <IconUsers size={size} stroke={stroke} />;
    case 'columns':
      return <IconColumns3 size={size} stroke={stroke} />;
    case 'cards':
      return <IconLayoutKanbanFilled size={size} stroke={stroke} />;
    case 'labels':
      return <IconTag size={size} stroke={stroke} />;
    case 'attachments':
      return <IconPaperclip size={size} stroke={stroke} />;
    case 'comments':
      return <IconMessageCircle size={size} stroke={stroke} />;
    case 'subtasks':
      return <IconChecklist size={size} stroke={stroke} />;
    case 'invites':
      return <IconLink size={size} stroke={stroke} />;
    case 'import':
      return <IconUpload size={size} stroke={stroke} />;
    case 'export':
      return <IconDownload size={size} stroke={stroke} />;
    case 'other':
      return <IconToolCompat size={size} stroke={stroke} />;
  }
}

export function categoryStatusColor(status: CategoryStatus): string {
  if (status === 'all') return 'var(--mantine-color-green-6)';
  if (status === 'some') return 'var(--mantine-color-orange-6)';
  return 'var(--mantine-color-gray-5)';
}
