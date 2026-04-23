import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconChecklist,
  IconColumns3,
  IconDownload,
  IconLayoutKanbanFilled,
  IconLink,
  IconLock,
  IconPlus,
  IconMessageCircle,
  IconPaperclip,
  IconSettings,
  IconTag,
  IconUpload,
  IconUsers,
} from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import { useAuthContext } from '../../contexts/AuthContext.js';
import { AppAdminMemberManagement } from './AppAdminMemberManagement.js';
import './rolesPermissionsTab.css';

type RoleRow = {
  key: string;
  displayName: string;
  description?: string;
  permissions: string[];
  hierarchyLevel: number;
  isBuiltIn: boolean;
};

type AppAdminRow = { _id: string; displayName: string; email: string };

const BUILTIN_ROLE_ORDER = ['admin', 'manager', 'viewer'] as const;

const BUILTIN_ROLE_DESCRIPTIONS: Readonly<Record<(typeof BUILTIN_ROLE_ORDER)[number], string>> = {
  admin:
    'Full workspace and board administration. Can manage settings, members, invites, structure, and all card content, including high-impact actions.',
  manager:
    'Day-to-day board operations role. Can organize lists/cards and manage board membership with constrained hierarchy updates, without full admin governance.',
  viewer:
    'Read-only collaboration role. Can access workspace and board content, labels, attachments, and exports, but cannot perform member or content mutations.',
} as const;

type PermissionCategoryKey =
  | 'workspaces'
  | 'boards'
  | 'board-settings'
  | 'members'
  | 'columns'
  | 'cards'
  | 'labels'
  | 'attachments'
  | 'comments'
  | 'subtasks'
  | 'invites'
  | 'import'
  | 'export'
  | 'other';

const CATEGORY_ORDER: readonly PermissionCategoryKey[] = [
  'workspaces',
  'boards',
  'board-settings',
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

function categoryLabel(key: PermissionCategoryKey): string {
  switch (key) {
    case 'workspaces':
      return 'Workspaces';
    case 'boards':
      return 'Boards';
    case 'board-settings':
      return 'Board Settings';
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

function categoryIcon(key: PermissionCategoryKey): ReactNode {
  const size = 16;
  const stroke = 1.6;
  switch (key) {
    case 'workspaces':
      return <IconUsers size={size} stroke={stroke} />;
    case 'boards':
      return <IconLayoutKanbanFilled size={size} stroke={stroke} />;
    case 'board-settings':
      return <IconSettings size={size} stroke={stroke} />;
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

function IconToolCompat(props: { readonly size: number; readonly stroke: number }) {
  return <IconSettings size={props.size} stroke={props.stroke} />;
}

const PERMISSION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // app.*
  'app.admin_config.view': 'View the global Admin Configuration panel.',
  'app.admin_config.edit': 'Edit global Admin Configuration settings.',
  'app.admin_config.external_mysql.test': 'Test external MySQL connectivity/verification settings.',
  'app.branding.assets.upload': 'Upload branding assets (logo, favicon, etc.).',
  'app.branding.assets.delete': 'Delete branding assets.',
  'app.fonts.upload': 'Upload custom fonts.',
  'app.fonts.delete': 'Delete custom fonts.',
  'app.users.unlock': 'Unlock locked user accounts.',
  'app.users.placeholder.list': 'List placeholder users created by imports.',
  'app.users.placeholder.convert': 'Convert a placeholder user into a regular user.',
  'app.users.placeholder.merge': 'Merge a placeholder user into an existing user.',
  'app.roles.list': 'List roles (built-in + custom).',
  'app.roles.create': 'Create a custom role.',
  'app.roles.update': 'Edit a custom role’s permissions.',
  'app.roles.delete': 'Delete a custom role.',
  'app.roles.assign_app_admin': 'Grant or revoke App Admin to a user.',
  'app.permission_sets.list': 'List permission sets.',
  'app.permission_sets.create': 'Create a permission set.',
  'app.permission_sets.update': 'Edit a permission set.',
  'app.permission_sets.delete': 'Delete a permission set.',
  // users.*
  'users.me.view': 'View your own user profile.',
  'users.me.update': 'Update your own profile.',
  'users.me.avatar.upload': 'Upload your profile picture.',
  'users.me.avatar.delete': 'Delete your profile picture.',
  'users.me.preferences.view': 'View your preferences.',
  'users.me.preferences.update': 'Update your preferences.',
  // workspaces.*
  'workspaces.create': 'Create a workspace.',
  'workspaces.list': 'List workspaces you can access.',
  'workspaces.view': 'View a workspace.',
  'workspaces.update': 'Update workspace settings.',
  'workspaces.delete': 'Delete a workspace.',
  'workspaces.members.view': 'View workspace members.',
  'workspaces.members.add': 'Add a member to a workspace.',
  'workspaces.members.remove': 'Remove a member from a workspace.',
  'workspaces.members.role.update': 'Change a workspace member’s role.',
  // boards.*
  'boards.create': 'Create a board.',
  'boards.list': 'List boards you can access.',
  'boards.view': 'View a board.',
  'boards.update': 'Update board settings/content.',
  'boards.delete': 'Delete a board.',
  'boards.reorder_in_home': 'Reorder boards on the home page.',
  'boards.settings.open': 'Open Board Settings (UI affordance).',
  'boards.settings.update': 'Update board settings (appearance + behavior).',
  'boards.members.view': 'View board members.',
  'boards.members.add': 'Add a member to a board.',
  'boards.members.remove': 'Remove a member from a board.',
  'boards.members.role.update': 'Change a board member’s role.',
  'boards.members.role.update.same':
    'Can update other board members role who have the same role hierarchy number as themself.',
  'boards.members.role.update.lower':
    'Can update other board members role to roles with a lower permissions hierarchy number than their own.',
  'boards.members.role.update.higher':
    'Can update other boards members role to roles with a higher permissions hierarchy number than their own.',
  'boards.members.role.update.samehigher':
    'Can update other boards members role to roles with the same number or higher.',
  'boards.members.role.update.samelower':
    'Can update other boards members role to roles with the same number or lower.',
  'boards.members.role.update.any':
    'Can update any board member role, including own role, to any role regardless of hierarchy.',
  // lists.*
  'lists.create': 'Create a column (list).',
  'lists.list': 'List columns (lists) in a board.',
  'lists.view': 'View a column (list).',
  'lists.update': 'Update a column (list).',
  'lists.delete': 'Delete a column (list).',
  'lists.reorder': 'Reorder columns (lists).',
  // cards.*
  'cards.create': 'Create a card.',
  'cards.list': 'List cards.',
  'cards.view': 'View a card.',
  'cards.update': 'Update a card.',
  'cards.dates.start.edit': 'Edit a card’s start date.',
  'cards.dates.due.edit': 'Edit a card’s due date.',
  'cards.dates.end.edit': 'Edit a card’s end date.',
  'cards.delete': 'Delete a card.',
  'cards.move': 'Move a card between columns.',
  'cards.reorder': 'Reorder cards within a column.',
  'cards.duplicate': 'Duplicate a card.',
  'cards.assignees.add': 'Assign users to a card.',
  'cards.assignees.remove': 'Remove assignees from a card.',
  'cards.reminders.create': 'Create reminders on a card.',
  'cards.reminders.update': 'Update reminders on a card.',
  'cards.reminders.delete': 'Delete reminders on a card.',
  'cards.reminders.dismiss': 'Dismiss a reminder.',
  // labels.*
  'labels.view': 'View labels available on a board.',
  'labels.create': 'Create a label.',
  'labels.update': 'Update a label.',
  'labels.delete': 'Delete a label.',
  'labels.assign': 'Assign a label to a card.',
  'labels.remove': 'Remove a label from a card.',
  // attachments.*
  'attachments.upload': 'Upload an attachment to a card.',
  'attachments.delete': 'Delete an attachment from a card.',
  // comments.*
  'comments.create': 'Create a comment.',
  'comments.update': 'Edit a comment (typically author-only).',
  'comments.delete': 'Delete a comment (typically author-only, with admin override where applicable).',
  // checklists.*
  'checklists.create': 'Create a checklist.',
  'checklists.update': 'Update a checklist.',
  'checklists.delete': 'Delete a checklist.',
  'checklists.items.create': 'Create a checklist item.',
  'checklists.items.update': 'Update a checklist item.',
  'checklists.items.delete': 'Delete a checklist item.',
  // invites.*
  'invites.create': 'Create an invite link.',
  'invites.view': 'View invite links.',
  'invites.delete': 'Delete/revoke an invite link.',
  'invites.accept': 'Accept an invite link.',
  // import/export
  'import.trello': 'Start a Trello import.',
  'import.wekan': 'Start a Wekan import.',
  'export.board.json': 'Export a board as JSON.',
  'export.board.csv': 'Export a board as CSV.',
  // ui.*
  'ui.admin_settings.open': 'Show the Admin Settings entry in the user menu.',
};

const MEMBERS_ROLE_UPDATE_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  {
    value: 'boards.members.role.update.same',
    label: 'Same hierarchy only',
  },
  {
    value: 'boards.members.role.update.lower',
    label: 'Lower hierarchy only',
  },
  {
    value: 'boards.members.role.update.higher',
    label: 'Higher hierarchy only',
  },
  {
    value: 'boards.members.role.update.samehigher',
    label: 'Same or higher hierarchy',
  },
  {
    value: 'boards.members.role.update.samelower',
    label: 'Same or lower hierarchy',
  },
  {
    value: 'boards.members.role.update.any',
    label: 'Any hierarchy (includes own role)',
  },
] as const;

const MEMBERS_ROLE_UPDATE_MODE_KEYS = new Set(MEMBERS_ROLE_UPDATE_MODE_OPTIONS.map((o) => o.value));

function clampHierarchyLevel(value: number): number {
  return Math.max(0, Math.min(1_000_000, Math.floor(value)));
}

function parseHierarchyFromInput(input: string, fallback: number): number {
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

function permissionCategoryForKey(permissionKey: string): PermissionCategoryKey {
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

type CategoryStatus = 'all' | 'some' | 'none';

function categoryStatusColor(status: CategoryStatus): string {
  if (status === 'all') return 'var(--mantine-color-green-6)';
  if (status === 'some') return 'var(--mantine-color-orange-6)';
  return 'var(--mantine-color-gray-5)';
}

function TriStateCategoryToggle(props: {
  readonly status: CategoryStatus;
  readonly disabled?: boolean;
  readonly onToggleAllOn: () => void;
  readonly onToggleAllOff: () => void;
}) {
  const { status, disabled, onToggleAllOn, onToggleAllOff } = props;

  const isAll = status === 'all';
  const isNone = status === 'none';
  const isSome = status === 'some';

  const ariaChecked: boolean | 'mixed' = isSome ? 'mixed' : isAll;

  // Track width 44, thumb width 18, 2px inset on both sides:
  // maxLeft = 44 - 2 - 18 = 24
  const thumbLeft = isNone ? 2 : isSome ? 13 : 24;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ariaChecked}
      aria-label="Toggle all permissions in category"
      disabled={disabled === true}
      onClick={() => {
        if (disabled === true) return;
        if (status === 'all') onToggleAllOff();
        else onToggleAllOn();
      }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: '1px solid var(--mantine-color-gray-4)',
        background:
          status === 'all'
            ? 'var(--mantine-color-blue-6)'
            : status === 'some'
              ? 'var(--mantine-color-orange-6)'
              : 'var(--mantine-color-gray-2)',
        position: 'relative',
        overflow: 'hidden',
        cursor: disabled === true ? 'not-allowed' : 'pointer',
        opacity: disabled === true ? 0.6 : 1,
        padding: 0,
        outline: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: thumbLeft,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  );
}

export function RolesPermissionsTab() {
  const { user: authUser } = useAuthContext();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [appAdmins, setAppAdmins] = useState<AppAdminRow[]>([]);
  const [bootstrapAppAdminId, setBootstrapAppAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('admin');
  const [activeCategory, setActiveCategory] = useState<PermissionCategoryKey>('workspaces');
  const [draftPermissions, setDraftPermissions] = useState<Record<string, readonly string[]>>({});
  const [draftHierarchyLevels, setDraftHierarchyLevels] = useState<Record<string, number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const activeIsAppAdmins = activeTab === '__app_admins__';

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [res, admins] = await Promise.all([api.getRoles(), api.getAppAdmins()]);
      const rows = ((res.roles as unknown[]) ?? []).map((raw) => {
        const row = raw as Partial<RoleRow>;
        return {
          key: typeof row.key === 'string' ? row.key : '',
          displayName: typeof row.displayName === 'string' ? row.displayName : 'Unknown',
          ...(typeof row.description === 'string' ? { description: row.description } : {}),
          permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
          hierarchyLevel:
            typeof row.hierarchyLevel === 'number' && Number.isFinite(row.hierarchyLevel)
              ? row.hierarchyLevel
              : 0,
          isBuiltIn: row.isBuiltIn === true,
        } satisfies RoleRow;
      }).filter((r) => r.key !== '');
      setRoles(rows);
      setAppAdmins((admins.appAdmins as AppAdminRow[]) ?? []);
      setBootstrapAppAdminId(
        typeof admins.bootstrapAppAdminId === 'string' ? admins.bootstrapAppAdminId : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles');
      setRoles([]);
      setAppAdmins([]);
      setBootstrapAppAdminId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const builtIn = useMemo(() => {
    const byKey = new Map(roles.filter((r) => r.isBuiltIn).map((r) => [r.key, r]));
    return BUILTIN_ROLE_ORDER.map((key) => byKey.get(key)).filter((r): r is RoleRow => r !== undefined);
  }, [roles]);

  const custom = useMemo(() => roles.filter((r) => !r.isBuiltIn), [roles]);

  const allPermissionStrings = useMemo(() => {
    const set = new Set<string>();
    for (const key of Object.keys(PERMISSION_DESCRIPTIONS)) {
      if (key.trim() !== '') {
        set.add(key.trim());
      }
    }
    for (const r of roles) {
      for (const p of r.permissions) {
        if (typeof p === 'string' && p.trim() !== '') {
          set.add(p.trim());
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roles]);

  const roleByKey = useMemo(() => new Map(roles.map((r) => [r.key, r])), [roles]);

  const activeRole = roleByKey.get(activeTab) ?? null;

  const activeEffectivePermissions = useMemo((): readonly string[] => {
    if (!activeRole || activeIsAppAdmins) {
      return [];
    }
    return draftPermissions[activeRole.key] ?? activeRole.permissions;
  }, [activeRole, draftPermissions, activeIsAppAdmins]);

  const activeEnabledSet = useMemo(() => new Set(activeEffectivePermissions), [activeEffectivePermissions]);

  const permissionKeysByCategory = useMemo(() => {
    const by = new Map<PermissionCategoryKey, string[]>();
    for (const c of CATEGORY_ORDER) {
      by.set(c, []);
    }
    for (const key of allPermissionStrings) {
      // Hide app-level, user-self, and UI-only permission keys from this editor.
      // - app.*: implicitly granted by App Admin assignment
      // - users.*: always allowed for the acting user on their own profile/preferences
      // - ui.*: client affordances (not role-configurable here)
      if (key.startsWith('app.') || key.startsWith('users.') || key.startsWith('ui.')) {
        continue;
      }
      // Hide `*.list` keys (list operations are implied by corresponding `*.view`).
      if (key.endsWith('.list')) {
        continue;
      }
      // `*.view` keys are implicitly granted to any board/workspace member (except `invites.view`,
      // which remains configurable for invite UI). Do not show them as toggles.
      if (key.endsWith('.view') && key !== 'invites.view') {
        continue;
      }
      if (MEMBERS_ROLE_UPDATE_MODE_KEYS.has(key)) {
        continue;
      }
      const cat = permissionCategoryForKey(key);
      const bucket = by.get(cat);
      if (bucket) {
        bucket.push(key);
      } else {
        by.set(cat, [key]);
      }
    }
    for (const [cat, keys] of by.entries()) {
      by.set(cat, keys.sort((a, b) => a.localeCompare(b)));
    }
    return by;
  }, [allPermissionStrings]);

  const categories = useMemo(() => {
    const present = new Set<PermissionCategoryKey>();
    for (const [cat, keys] of permissionKeysByCategory.entries()) {
      if (keys.length > 0) {
        present.add(cat);
      }
    }
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    // Ensure the active category always exists (pick first present).
    if (!present.has(activeCategory) && ordered.length > 0) {
      setActiveCategory(ordered[0]!);
    }
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionKeysByCategory]);

  const categoryStatuses = useMemo(() => {
    const next = new Map<PermissionCategoryKey, CategoryStatus>();
    for (const c of categories) {
      const keys = permissionKeysByCategory.get(c) ?? [];
      if (keys.length === 0) {
        next.set(c, 'none');
        continue;
      }
      let enabled = 0;
      for (const k of keys) {
        if (activeEnabledSet.has(k)) {
          enabled += 1;
        }
      }
      next.set(c, enabled === 0 ? 'none' : enabled === keys.length ? 'all' : 'some');
    }
    return next;
  }, [permissionKeysByCategory, activeEnabledSet, categories]);

  const setAllPermissionsForActiveCategory = (enabled: boolean): void => {
    if (!activeRole || activeIsAppAdmins || activeRole.isBuiltIn) {
      return;
    }
    const keys = permissionKeysByCategory.get(activeCategory) ?? [];
    if (keys.length === 0) {
      return;
    }
    const base = draftPermissions[activeRole.key] ?? activeRole.permissions;
    const next = new Set(base.map((p) => p.trim()).filter((p) => p !== ''));
    if (enabled) {
      for (const k of keys) next.add(k);
    } else {
      for (const k of keys) next.delete(k);
    }
    setDraftPermissions((prev) => ({
      ...prev,
      [activeRole.key]: [...next].sort((a, b) => a.localeCompare(b)),
    }));
  };

  const activeIsDirty =
    activeRole != null &&
    !activeIsAppAdmins &&
    (draftPermissions[activeRole.key] !== undefined ||
      (draftHierarchyLevels[activeRole.key] !== undefined &&
        draftHierarchyLevels[activeRole.key] !== activeRole.hierarchyLevel));

  const togglePermission = (roleKey: string, permission: string): void => {
    const role = roleByKey.get(roleKey);
    if (!role) {
      return;
    }
    if (role.isBuiltIn) {
      return;
    }
    const current = new Set((draftPermissions[roleKey] ?? role.permissions).map((p) => p.trim()).filter((p) => p !== ''));
    if (current.has(permission)) {
      current.delete(permission);
    } else {
      current.add(permission);
    }
    setDraftPermissions((prev) => ({ ...prev, [roleKey]: [...current].sort((a, b) => a.localeCompare(b)) }));
  };

  const activeMemberRoleUpdateMode = useMemo((): string | null => {
    if (!activeRole || activeIsAppAdmins) {
      return null;
    }
    const perms = draftPermissions[activeRole.key] ?? activeRole.permissions;
    for (const option of MEMBERS_ROLE_UPDATE_MODE_OPTIONS) {
      if (perms.includes(option.value)) {
        return option.value;
      }
    }
    return null;
  }, [activeRole, activeIsAppAdmins, draftPermissions]);

  const setMemberRoleUpdateMode = (roleKey: string, modeKey: string | null): void => {
    const role = roleByKey.get(roleKey);
    if (!role || role.isBuiltIn) {
      return;
    }
    const base = draftPermissions[roleKey] ?? role.permissions;
    const next = new Set(
      base
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .filter((p) => !MEMBERS_ROLE_UPDATE_MODE_KEYS.has(p)),
    );
    if (modeKey != null && modeKey !== '') {
      next.add(modeKey);
    }
    setDraftPermissions((prev) => ({ ...prev, [roleKey]: [...next].sort((a, b) => a.localeCompare(b)) }));
  };

  const setHierarchyDraft = (roleKey: string, next: number): void => {
    setDraftHierarchyLevels((prev) => ({ ...prev, [roleKey]: next }));
  };

  const saveActiveRole = async (): Promise<void> => {
    if (!activeRole || activeIsAppAdmins) {
      return;
    }
    const nextPerms = draftPermissions[activeRole.key];
    const nextHierarchy = draftHierarchyLevels[activeRole.key];
    const hasPermDraft = nextPerms !== undefined;
    const hasHierarchyDraft = nextHierarchy !== undefined && nextHierarchy !== activeRole.hierarchyLevel;
    if (!hasPermDraft && !hasHierarchyDraft) {
      return;
    }
    const finalHierarchy = nextHierarchy ?? activeRole.hierarchyLevel;
    const hierarchyToRole = new Map<number, string>();
    for (const role of roles) {
      const level = role.key === activeRole.key ? finalHierarchy : (draftHierarchyLevels[role.key] ?? role.hierarchyLevel);
      const owner = hierarchyToRole.get(level);
      if (owner && owner !== role.key) {
        setError(`Hierarchy number ${level} is already used by role "${owner}".`);
        return;
      }
      hierarchyToRole.set(level, role.key);
    }
    setSavingKey(activeRole.key);
    setError(null);
    try {
      await api.updateRole(activeRole.key, {
        ...(hasPermDraft && nextPerms ? { permissions: [...nextPerms] } : {}),
        ...(hasHierarchyDraft ? { hierarchyLevel: finalHierarchy } : {}),
      });
      setDraftPermissions((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      setDraftHierarchyLevels((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save role');
    } finally {
      setSavingKey(null);
    }
  };

  const deleteActiveRole = async (): Promise<void> => {
    if (!activeRole || activeRole.isBuiltIn) {
      return;
    }
    setSavingKey(activeRole.key);
    setError(null);
    try {
      await api.deleteRole(activeRole.key);
      setDraftPermissions((prev) => {
        const { [activeRole.key]: _removed, ...rest } = prev;
        return rest;
      });
      setActiveTab('admin');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete role');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Box className="roles-permissions-tab">
      <Title order={3} mb="sm">
        Permissions
      </Title>

      {error ? <Alert color="red" mb="sm">{error}</Alert> : null}
      {loading ? (
        <Box style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
          <Loader size="sm" />
        </Box>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(v) => {
          if (v === '__create_custom_role__') {
            setShowCreate(true);
            return;
          }
          if (typeof v === 'string' && v !== '') {
            setActiveTab(v);
          }
        }}
        orientation="vertical"
        keepMounted={false}
        classNames={{ root: 'roles-permissions-tab__tabs-root' }}
      >
        <Group align="stretch" wrap="nowrap" gap="md" className="roles-permissions-tab__tabs-row">
          <Tabs.List style={{ minWidth: 220 }}>
            <Tabs.Tab value="__app_admins__">
              <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
                <Text fw={600} size="sm">
                  App Admins
                </Text>
                <IconLock size={16} stroke={1.8} aria-hidden />
              </Group>
            </Tabs.Tab>

            <Text size="xs" c="dimmed" fw={600} px="xs" mt="sm" mb={6}>
              Built-in Roles
            </Text>
            {builtIn.map((r) => (
              <Tabs.Tab key={r.key} value={r.key}>
                <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
                  <Text fw={600} size="sm">
                    {r.displayName}
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed" fw={700}>
                      {r.hierarchyLevel}
                    </Text>
                    <IconLock size={14} stroke={1.8} aria-hidden />
                  </Group>
                </Group>
              </Tabs.Tab>
            ))}

            <Divider my="xs" />

            {custom.length > 0 ? (
              <>
                <Text size="xs" c="dimmed" fw={600} px="xs" mt="sm" mb={6}>
                  Custom roles
                </Text>
                {custom.map((r) => (
                  <Tabs.Tab key={r.key} value={r.key}>
                    <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
                      <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
                        {r.displayName}
                      </Text>
                      <Text size="xs" c="dimmed" fw={700}>
                        {r.hierarchyLevel}
                      </Text>
                    </Group>
                  </Tabs.Tab>
                ))}
              </>
            ) : null}

            <Tabs.Tab value="__create_custom_role__">
              <Group gap="xs" wrap="nowrap" justify="flex-start" align="center">
                <IconPlus size={16} stroke={1.8} aria-hidden />
                <Text fw={600} size="sm">
                  Add custom role
                </Text>
              </Group>
            </Tabs.Tab>

          </Tabs.List>

          {activeIsAppAdmins ? (
            <Box className="roles-permissions-tab__app-admins-panel">
              <Stack gap="xs" style={{ flexShrink: 0 }} mb="sm">
                <Title order={4}>App Admins</Title>
                <Text size="sm" c="dimmed">
                  Grant or revoke global App Admin access. App admins can access this admin configuration/modify all aspects of the app.
                </Text>
              </Stack>
              <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <AppAdminMemberManagement
                  appAdmins={appAdmins}
                  onAppAdminsChange={load}
                  currentUserId={authUser?.id}
                  bootstrapAppAdminId={bootstrapAppAdminId}
                />
              </Box>
            </Box>
          ) : (
            <>
              <Box style={{ minWidth: 220 }}>
                <Stack gap={6}>
                  <Text size="xs" c="dimmed" fw={600} px="xs" mt={2} mb={6}>
                    Permission categories
                  </Text>
                  {categories.map((catKey) => {
                    const status = categoryStatuses.get(catKey) ?? 'none';
                    const color = categoryStatusColor(status);
                    const isActive = activeCategory === catKey;
                    return (
                      <Button
                        key={catKey}
                        variant={isActive ? 'light' : 'subtle'}
                        color={isActive ? 'blue' : 'gray'}
                        justify="space-between"
                        leftSection={categoryIcon(catKey)}
                        rightSection={
                          <Box
                            aria-hidden
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: color,
                              flex: '0 0 auto',
                            }}
                          />
                        }
                        styles={{
                          inner: { width: '100%' },
                          label: { width: '100%', justifyContent: 'flex-start', minWidth: 0 },
                          section: { marginInline: 0 },
                        }}
                        onClick={() => setActiveCategory(catKey)}
                      >
                        <Text
                          size="sm"
                          fw={600}
                          lineClamp={1}
                          style={{ textAlign: 'left' }}
                          {...(!isActive ? { c: 'dimmed' } : {})}
                        >
                          {categoryLabel(catKey)}
                        </Text>
                      </Button>
                    );
                  })}
                </Stack>
              </Box>

              <Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {activeRole ? (
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Group gap="xs" align="center" wrap="nowrap">
                      <Title order={4} style={{ whiteSpace: 'nowrap' }}>
                        {activeRole.displayName}
                      </Title>
                      {activeRole.isBuiltIn ? (
                        <Text size="sm" c="dimmed" fw={600}>
                          Read-only
                        </Text>
                      ) : activeIsDirty ? (
                        <Text size="sm" c="orange" fw={600}>
                          Unsaved changes
                        </Text>
                      ) : (
                        <Text size="sm" c="green" fw={600}>
                          Editable
                        </Text>
                      )}
                    </Group>
                    {(activeRole.description ??
                    (activeRole.isBuiltIn && (activeRole.key in BUILTIN_ROLE_DESCRIPTIONS)
                      ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                      : undefined)) ? (
                      <Text size="sm" mt={6}>
                        {activeRole.description ??
                          (activeRole.isBuiltIn && (activeRole.key in BUILTIN_ROLE_DESCRIPTIONS)
                            ? BUILTIN_ROLE_DESCRIPTIONS[activeRole.key as (typeof BUILTIN_ROLE_ORDER)[number]]
                            : '')}
                      </Text>
                    ) : null}
                    <Tooltip
                      label="Higher hierarchy number means higher role level. Users cannot assign or promote to roles above their allowed hierarchy/mode."
                      multiline
                      maw={420}
                      openDelay={150}
                      position="bottom-start"
                    >
                      <Box mt={10} maw={220}>
                        <TextInput
                          size="sm"
                          label="Hierarchy"
                          value={String(draftHierarchyLevels[activeRole.key] ?? activeRole.hierarchyLevel)}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          onChange={(e) => {
                            const next = parseHierarchyFromInput(
                              e.currentTarget.value,
                              activeRole.hierarchyLevel,
                            );
                            setHierarchyDraft(activeRole.key, next);
                          }}
                        />
                      </Box>
                    </Tooltip>
                  </Box>

                  {activeRole ? (
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        size="sm"
                        onClick={() => void saveActiveRole()}
                        disabled={!activeIsDirty}
                        loading={savingKey === activeRole.key}
                      >
                        Save changes
                      </Button>
                      {!activeRole.isBuiltIn ? (
                        <Button
                          size="sm"
                          color="red"
                          variant="light"
                          onClick={() => void deleteActiveRole()}
                          loading={savingKey === activeRole.key}
                        >
                          Delete role
                        </Button>
                      ) : null}
                    </Group>
                  ) : null}
                </Group>

                <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                  {allPermissionStrings.length === 0 ? (
                    <Text c="dimmed" pr="sm">
                      No permissions found.
                    </Text>
                  ) : (
                    <Grid gutter="xs" pr="sm">
                      <Grid.Col span={12}>
                        <Card withBorder radius="md" p="sm">
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Box style={{ minWidth: 0 }}>
                              <Text fw={700} size="sm" lineClamp={1}>
                                {categoryLabel(activeCategory)}
                              </Text>
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                Toggle all permissions in this category.
                              </Text>
                            </Box>
                            <TriStateCategoryToggle
                              status={categoryStatuses.get(activeCategory) ?? 'none'}
                              disabled={!activeRole || activeRole.isBuiltIn}
                              onToggleAllOn={() => setAllPermissionsForActiveCategory(true)}
                              onToggleAllOff={() => setAllPermissionsForActiveCategory(false)}
                            />
                          </Group>
                        </Card>
                      </Grid.Col>

                      {activeCategory === 'members' ? (
                        <Grid.Col span={12}>
                          <Card withBorder radius="md" p="sm">
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Box style={{ minWidth: 0 }}>
                                <Text fw={600} size="sm" lineClamp={1}>
                                  Board member role update mode
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={2}>
                                  Choose exactly one hierarchy rule for board member role updates.
                                </Text>
                              </Box>
                              <Group gap="sm" wrap="nowrap" align="center">
                                <Select
                                  size="xs"
                                  w={280}
                                  data={[...MEMBERS_ROLE_UPDATE_MODE_OPTIONS]}
                                  value={activeMemberRoleUpdateMode}
                                  onChange={(value) => setMemberRoleUpdateMode(activeRole.key, value)}
                                  disabled={activeRole.isBuiltIn || !activeEnabledSet.has('boards.members.role.update')}
                                  allowDeselect={false}
                                />
                                <Switch
                                  size="md"
                                  checked={activeMemberRoleUpdateMode != null}
                                  disabled={activeRole.isBuiltIn}
                                  onChange={(e) => {
                                    if (e.currentTarget.checked) {
                                      const fallback = activeMemberRoleUpdateMode ?? MEMBERS_ROLE_UPDATE_MODE_OPTIONS[0]?.value ?? null;
                                      setMemberRoleUpdateMode(activeRole.key, fallback);
                                    } else {
                                      setMemberRoleUpdateMode(activeRole.key, null);
                                    }
                                  }}
                                  aria-label="Toggle board member role update mode"
                                  withThumbIndicator={false}
                                />
                              </Group>
                            </Group>
                          </Card>
                        </Grid.Col>
                      ) : null}
                      {(permissionKeysByCategory.get(activeCategory) ?? []).map((perm) => (
                        <Grid.Col key={perm} span={{ base: 12, md: 6 }}>
                          <Card withBorder radius="md" p="sm">
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Box style={{ minWidth: 0 }}>
                                <Text fw={600} size="sm" lineClamp={1}>
                                  {perm}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={2}>
                                  {PERMISSION_DESCRIPTIONS[perm] ?? 'No description available.'}
                                </Text>
                              </Box>
                              <Switch
                                size="md"
                                checked={activeEnabledSet.has(perm)}
                                disabled={activeRole.isBuiltIn}
                                onChange={() => togglePermission(activeRole.key, perm)}
                                aria-label={`Toggle ${perm}`}
                                withThumbIndicator={false}
                              />
                            </Group>
                          </Card>
                        </Grid.Col>
                      ))}
                    </Grid>
                  )}
                </ScrollArea>
                  </Stack>
                ) : (
                  <Text c="dimmed">Select a role.</Text>
                )}
              </Box>
            </>
          )}
        </Group>
      </Tabs>

      {showCreate ? (
        <CreateRoleModal
          existingRoleKeys={roles.map((r) => r.key)}
          onClose={() => setShowCreate(false)}
          onCreated={async (createdRoleKey) => {
            setShowCreate(false);
            setActiveTab(createdRoleKey);
            await load();
          }}
        />
      ) : null}
    </Box>
  );
}

function toCustomRoleSlug(displayName: string): string {
  const raw = displayName.trim().toLowerCase();
  const dashed = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  return dashed;
}

function buildUniqueCustomRoleKey(displayName: string, existingRoleKeys: ReadonlySet<string>): string | null {
  const baseSlug = toCustomRoleSlug(displayName);
  if (baseSlug.length < 3) {
    return null;
  }

  const maxSlugLen = 50;
  const trimmedBase = baseSlug.length > maxSlugLen ? baseSlug.slice(0, maxSlugLen) : baseSlug;

  const candidate = `custom:${trimmedBase}`;
  if (!existingRoleKeys.has(candidate)) {
    return candidate;
  }

  for (let i = 2; i < 1000; i += 1) {
    const suffix = `-${i}`;
    const allowedBaseLen = maxSlugLen - suffix.length;
    if (allowedBaseLen < 3) {
      return null;
    }
    const withSuffix = `custom:${trimmedBase.slice(0, allowedBaseLen)}${suffix}`;
    if (!existingRoleKeys.has(withSuffix)) {
      return withSuffix;
    }
  }

  return null;
}

function CreateRoleModal(props: {
  readonly existingRoleKeys: readonly string[];
  readonly onClose: () => void;
  readonly onCreated: (createdRoleKey: string) => Promise<void>;
}) {
  const { existingRoleKeys, onClose, onCreated } = props;
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [hierarchyLevel, setHierarchyLevel] = useState<number>(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingKeySet = useMemo(() => new Set(existingRoleKeys), [existingRoleKeys]);
  const derivedKey = useMemo(
    () => buildUniqueCustomRoleKey(displayName, existingKeySet),
    [displayName, existingKeySet],
  );

  const submit = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const key = derivedKey;
      if (!key) {
        setError('Role name must be unique and valid (min 3 characters; letters/numbers).');
        return;
      }
      await api.createRole({
        key,
        displayName: displayName.trim(),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
        permissions: [],
        hierarchyLevel,
      });
      await onCreated(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Create custom role" centered>
      <Stack gap="sm">
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput
          label="Role name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="e.g. Board Editor"
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={2}
        />
        <TextInput
          label="Hierarchy number"
          value={String(hierarchyLevel)}
          inputMode="numeric"
          pattern="[0-9]*"
          onChange={(e) => {
            const next = parseHierarchyFromInput(e.currentTarget.value, 1000);
            setHierarchyLevel(next);
          }}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={loading} disabled={derivedKey === null}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

