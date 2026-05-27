import type { PermissionCategoryKey } from './types.js';

export function clampHierarchyLevel(value: number): number {
  return Math.max(0, Math.min(1_000_000, Math.floor(value)));
}

/** First unused hierarchy level for a new custom role (built-ins use ≤300; customs start at 1000). */
export function suggestNextHierarchyLevel(
  roles: readonly { readonly hierarchyLevel: number }[],
): number {
  const CUSTOM_ROLE_HIERARCHY_FLOOR = 1000;
  let maxLevel = CUSTOM_ROLE_HIERARCHY_FLOOR - 1;
  for (const role of roles) {
    if (Number.isFinite(role.hierarchyLevel) && role.hierarchyLevel > maxLevel) {
      maxLevel = role.hierarchyLevel;
    }
  }
  return clampHierarchyLevel(Math.max(CUSTOM_ROLE_HIERARCHY_FLOOR, maxLevel + 1));
}

export function parseHierarchyFromInput(input: string, fallback: number): number {
  const digits = input.replace(/\D+/g, '');
  if (digits === '') {
    return fallback;
  }
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampHierarchyLevel(parsed);
}

export function permissionCategoryForKey(permissionKey: string): PermissionCategoryKey {
  if (permissionKey.startsWith('boards.themes.')) return 'theme-background';
  if (permissionKey.startsWith('boards.settings.')) return 'board-settings';
  if (permissionKey.startsWith('boards.members.')) return 'members';
  if (permissionKey.startsWith('lists.')) return 'columns';

  const root = permissionKey.split('.')[0] ?? '';
  if (root === 'workspaces') return 'workspaces';
  if (root === 'boards') return 'boards';
  if (root === 'cards') return 'cards';
  if (root === 'labels') return 'labels';
  if (root === 'attachments') return 'attachments';
  if (root === 'comments') return 'comments';
  if (root === 'checklists') return 'subtasks';
  if (root === 'invites') return 'invites';
  if (root === 'import') return 'import';
  if (root === 'export') return 'export';
  return 'other';
}
