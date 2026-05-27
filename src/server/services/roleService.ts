import { RoleDefinition } from '../models/RoleDefinition.js';
import { logger } from '../utils/logger.js';
import { Board } from '../models/Board.js';
import { InviteLink } from '../models/InviteLink.js';
import { Workspace } from '../models/Workspace.js';
import { LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY } from '../../shared/export/boardExportPermissions.js';

export type BuiltInRoleKey = 'admin' | 'manager' | 'viewer';
export type RoleKey = BuiltInRoleKey | `custom:${string}`;

export interface BuiltInRoleSeed {
  readonly key: BuiltInRoleKey;
  readonly displayName: string;
  readonly permissions: readonly string[];
  readonly hierarchyLevel: number;
}

export const BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS = [
  'boards.members.role.update.same',
  'boards.members.role.update.lower',
  'boards.members.role.update.higher',
  'boards.members.role.update.samehigher',
  'boards.members.role.update.samelower',
  'boards.members.role.update.any',
] as const;

export type BoardMemberRoleUpdateModeKey = (typeof BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS)[number];

const BUILTIN_ROLE_HIERARCHY_LEVELS: Readonly<Record<BuiltInRoleKey, number>> = {
  viewer: 100,
  manager: 200,
  admin: 300,
} as const;

export const BUILTIN_ROLE_SEEDS: readonly BuiltInRoleSeed[] = [
  {
    key: 'admin',
    displayName: 'Admin',
    hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.admin,
    permissions: [
      'workspaces.view',
      'workspaces.update',
      'workspaces.members.view',
      'workspaces.members.add',
      'workspaces.members.remove',
      'workspaces.members.role.update',
      'boards.view',
      'lists.view',
      'cards.view',
      'export.board.csv',
      'export.board.trello',
      'export.board.wekan',
      'export.board.atlantisboard',
      'invites.accept',
      'labels.view',
      'boards.members.view',
      'boards.members.add',
      'boards.members.remove',
      'boards.members.role.update',
      'boards.members.role.update.any',
      'boards.settings.open',
      'labels.create',
      'labels.update',
      'labels.delete',
      'invites.create',
      'invites.view',
      'invites.delete',
      'boards.update',
      'boards.settings.update',
      'boards.themes.changetheme',
      'boards.themes.customtheme',
      'boards.create',
      'lists.create',
      'lists.update',
      'lists.reorder',
      'lists.delete',
      'cards.create',
      'cards.update',
      'cards.dates.start.edit',
      'cards.dates.due.edit',
      'cards.dates.end.edit',
      'cards.delete',
      'cards.move',
      'cards.reorder',
      'cards.duplicate',
      'attachments.upload',
      'attachments.delete',
      'checklists.create',
      'checklists.update',
      'checklists.delete',
      'checklists.items.create',
      'checklists.items.update',
      'checklists.items.delete',
      'comments.create',
      'comments.delete',
      'import.trello',
      'import.wekan',
    ],
  },
  {
    key: 'manager',
    displayName: 'Manager',
    hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.manager,
    permissions: [
      'workspaces.view',
      'boards.view',
      'lists.view',
      'cards.view',
      'export.board.csv',
      'export.board.trello',
      'export.board.wekan',
      'export.board.atlantisboard',
      'invites.accept',
      'labels.view',
      'boards.members.view',
      'boards.members.add',
      'boards.members.remove',
      'boards.members.role.update.lower',
      'boards.settings.open',
      'lists.create',
      'lists.update',
      'lists.reorder',
      'cards.create',
      'cards.update',
      'cards.move',
      'cards.reorder',
      'attachments.upload',
      'attachments.delete',
      'checklists.create',
      'checklists.update',
      'checklists.delete',
      'checklists.items.create',
      'checklists.items.update',
      'checklists.items.delete',
      'comments.create',
      'import.trello',
      'import.wekan',
    ],
  },
  {
    key: 'viewer',
    displayName: 'Viewer',
    hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.viewer,
    permissions: [
      'workspaces.view',
      'boards.view',
      'lists.view',
      'cards.view',
      'export.board.csv',
      'export.board.trello',
      'export.board.wekan',
      'export.board.atlantisboard',
      'invites.accept',
      'labels.view',
    ],
  },
] as const;

export async function initializeRoleDefinitions(): Promise<void> {
  for (const seed of BUILTIN_ROLE_SEEDS) {
    const existing = await RoleDefinition.findOne({ key: seed.key }).select('_id').lean();
    if (existing) {
      continue;
    }
    await RoleDefinition.create({
      key: seed.key,
      displayName: seed.displayName,
      permissions: [...seed.permissions],
      hierarchyLevel: seed.hierarchyLevel,
      isBuiltIn: true,
    });
  }

  // Remove legacy built-in role "member" (treat as viewer).
  await RoleDefinition.deleteOne({ key: 'member', isBuiltIn: true }).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.admin } },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.manager } },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'viewer', isBuiltIn: true, hierarchyLevel: { $exists: false } },
    { $set: { hierarchyLevel: BUILTIN_ROLE_HIERARCHY_LEVELS.viewer } },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: ['comments.delete', 'cards.duplicate'],
        },
      },
    },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true },
    {
      $pull: {
        permissions: {
          $each: [
            'comments.delete',
            'invites.view',
            'cards.duplicate',
            'boards.members.role.update',
            'boards.members.role.update.samelower',
            'boards.members.role.update.same',
            'boards.members.role.update.higher',
            'boards.members.role.update.samehigher',
            'boards.members.role.update.any',
          ],
        },
      },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { permissions: { $in: ['boards.reorder_in_home'] } },
    { $pull: { permissions: 'boards.reorder_in_home' } },
  ).catch(() => undefined);

  // Permission key migration: import.*.start → import.*
  await RoleDefinition.updateMany(
    { permissions: { $in: ['import.trello.start', 'import.wekan.start'] } },
    [
      {
        $set: {
          permissions: {
            $let: {
              vars: {
                mapped: {
                  $map: {
                    input: '$permissions',
                    as: 'p',
                    in: {
                      $switch: {
                        branches: [
                          { case: { $eq: ['$$p', 'import.trello.start'] }, then: 'import.trello' },
                          { case: { $eq: ['$$p', 'import.wekan.start'] }, then: 'import.wekan' },
                        ],
                        default: '$$p',
                      },
                    },
                  },
                },
              },
              in: {
                $reduce: {
                  input: '$$mapped',
                  initialValue: [],
                  in: {
                    $cond: [
                      { $in: ['$$this', '$$value'] },
                      '$$value',
                      { $concatArrays: ['$$value', ['$$this']] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Drop deprecated import permission keys.
  await RoleDefinition.updateMany(
    {
      permissions: {
        $in: ['import.csv.start', 'import.jobs.view_own'],
      },
    },
    {
      $pull: {
        permissions: {
          $in: ['import.csv.start', 'import.jobs.view_own'],
        },
      },
    },
  ).catch(() => undefined);

  // Permission key migration: export.board.json → per-format export keys.
  await RoleDefinition.updateMany(
    { permissions: LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY },
    {
      $addToSet: {
        permissions: {
          $each: [
            'export.board.trello',
            'export.board.wekan',
            'export.board.atlantisboard',
          ],
        },
      },
    },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { permissions: LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY },
    {
      $pull: {
        permissions: LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY,
      },
    },
  ).catch(() => undefined);

  // Attachment download URL + file streaming are not configurable permissions (any board member).
  await RoleDefinition.updateMany(
    {
      permissions: {
        $in: ['attachments.file.stream', 'attachments.download_url.view'],
      },
    },
    {
      $pull: {
        permissions: {
          $in: ['attachments.file.stream', 'attachments.download_url.view'],
        },
      },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: { $each: ['boards.create'] },
      },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true },
    {
      $pull: {
        permissions: {
          $each: ['import.display', 'cards.duplicate', 'invites.view', 'workspaces.create'],
        },
      },
    },
  ).catch(() => undefined);

  const {
    migrateAccountCapabilitiesFromWorkspaceRoles,
    pullAccountCapabilitiesFromAllRoles,
  } = await import('./accountCapabilitiesService.js');
  await migrateAccountCapabilitiesFromWorkspaceRoles();
  await pullAccountCapabilitiesFromAllRoles();

  // Theme permissions: admin defaults + compatibility backfill for existing role docs.
  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: ['boards.themes.changetheme', 'boards.themes.customtheme'],
        },
      },
    },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { permissions: 'boards.settings.update' },
    {
      $addToSet: {
        permissions: {
          $each: ['boards.themes.changetheme', 'boards.themes.customtheme'],
        },
      },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: ['cards.dates.start.edit', 'cards.dates.due.edit', 'cards.dates.end.edit'],
        },
      },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: { $in: ['admin', 'manager', 'viewer'] }, isBuiltIn: true },
    {
      $pull: {
        permissions: {
          $in: [
            'boards.members.role.update.same',
            'boards.members.role.update.lower',
            'boards.members.role.update.higher',
            'boards.members.role.update.samehigher',
            'boards.members.role.update.samelower',
            'boards.members.role.update.any',
          ],
        },
      },
    },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: { permissions: { $each: ['boards.members.role.update.any'] } },
    },
  ).catch(() => undefined);
  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true },
    {
      $addToSet: { permissions: { $each: ['boards.members.role.update.lower'] } },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'manager', isBuiltIn: true },
    {
      $pull: { permissions: 'boards.create' },
    },
  ).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: [
            'workspaces.update',
            'workspaces.members.view',
            'workspaces.members.add',
            'workspaces.members.remove',
            'workspaces.members.role.update',
          ],
        },
      },
    },
  ).catch(() => undefined);

  // Permission key migration: boards.view_kanban_snapshot → boards.view (drop snapshot key).
  await RoleDefinition.updateMany(
    { permissions: 'boards.view_kanban_snapshot' },
    [
      {
        $set: {
          permissions: {
            $let: {
              vars: {
                filtered: {
                  $filter: {
                    input: '$permissions',
                    as: 'p',
                    cond: { $ne: ['$$p', 'boards.view_kanban_snapshot'] },
                  },
                },
              },
              in: {
                $cond: [
                  { $in: ['boards.view', '$$filtered'] },
                  '$$filtered',
                  { $concatArrays: ['$$filtered', ['boards.view']] },
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Permission key migration: ui.boards.settings.open → boards.settings.open
  await RoleDefinition.updateMany(
    { permissions: 'ui.boards.settings.open' },
    [
      {
        $set: {
          permissions: {
            $map: {
              input: '$permissions',
              as: 'p',
              in: {
                $cond: [
                  { $eq: ['$$p', 'ui.boards.settings.open'] },
                  'boards.settings.open',
                  '$$p',
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Lightweight backward-compat backfill for legacy docs.
  // - boards.members.roleKey defaults to boards.members.role
  // - invites.roleKey defaults to invites.role
  // - member role is migrated to viewer
  await Board.updateMany(
    { 'members.roleKey': { $exists: false } },
    [{ $set: { members: { $map: { input: '$members', as: 'm', in: { $mergeObjects: ['$$m', { roleKey: '$$m.role' }] } } } } }],
    { updatePipeline: true },
  ).catch(() => undefined);
  await Board.updateMany(
    { $or: [{ 'members.role': 'member' }, { 'members.roleKey': 'member' }] },
    [
      {
        $set: {
          members: {
            $map: {
              input: '$members',
              as: 'm',
              in: {
                $mergeObjects: [
                  '$$m',
                  {
                    role: { $cond: [{ $eq: ['$$m.role', 'member'] }, 'viewer', '$$m.role'] },
                    roleKey: { $cond: [{ $eq: ['$$m.roleKey', 'member'] }, 'viewer', '$$m.roleKey'] },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Option B: board members are roleKey-only; strip redundant coarse role field.
  await Board.updateMany(
    { members: { $exists: true, $ne: [] } },
    [
      {
        $set: {
          members: {
            $map: {
              input: '$members',
              as: 'm',
              in: {
                userId: '$$m.userId',
                roleKey: {
                  $let: {
                    vars: {
                      rk: {
                        $cond: [
                          { $and: [{ $ne: ['$$m.roleKey', null] }, { $ne: ['$$m.roleKey', ''] }] },
                          '$$m.roleKey',
                          '$$m.role',
                        ],
                      },
                    },
                    in: { $cond: [{ $eq: ['$$rk', 'member'] }, 'viewer', '$$rk'] },
                  },
                },
                addedAt: '$$m.addedAt',
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  await Workspace.updateMany(
    { 'members.role': 'member' },
    [
      {
        $set: {
          members: {
            $map: {
              input: '$members',
              as: 'm',
              in: {
                $mergeObjects: ['$$m', { role: { $cond: [{ $eq: ['$$m.role', 'member'] }, 'viewer', '$$m.role'] } }],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Option B extension: workspace members are roleKey-only; backfill roleKey then strip role.
  await Workspace.updateMany(
    { 'members.roleKey': { $exists: false } },
    [
      {
        $set: {
          members: {
            $map: {
              input: '$members',
              as: 'm',
              in: { $mergeObjects: ['$$m', { roleKey: '$$m.role' }] },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);
  await Workspace.updateMany(
    { members: { $exists: true, $ne: [] } },
    [
      {
        $set: {
          members: {
            $map: {
              input: '$members',
              as: 'm',
              in: {
                userId: '$$m.userId',
                roleKey: {
                  $let: {
                    vars: {
                      rk: {
                        $cond: [
                          { $and: [{ $ne: ['$$m.roleKey', null] }, { $ne: ['$$m.roleKey', ''] }] },
                          '$$m.roleKey',
                          '$$m.role',
                        ],
                      },
                    },
                    in: { $cond: [{ $eq: ['$$rk', 'member'] }, 'viewer', '$$rk'] },
                  },
                },
                joinedAt: '$$m.joinedAt',
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  await InviteLink.updateMany(
    { roleKey: { $exists: false } },
    [{ $set: { roleKey: '$role' } }],
    { updatePipeline: true },
  ).catch(() => undefined);
  await InviteLink.updateMany(
    { $or: [{ role: 'member' }, { roleKey: 'member' }] },
    [
      {
        $set: {
          role: { $cond: [{ $eq: ['$role', 'member'] }, 'viewer', '$role'] },
          roleKey: { $cond: [{ $eq: ['$roleKey', 'member'] }, 'viewer', '$roleKey'] },
        },
      },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Option B extension: invites are roleKey-only; strip redundant coarse role field.
  await InviteLink.updateMany(
    {},
    [
      {
        $set: {
          roleKey: {
            $let: {
              vars: {
                rk: {
                  $cond: [
                    { $and: [{ $ne: ['$roleKey', null] }, { $ne: ['$roleKey', ''] }] },
                    '$roleKey',
                    '$role',
                  ],
                },
              },
              in: { $cond: [{ $eq: ['$$rk', 'member'] }, 'viewer', '$$rk'] },
            },
          },
        },
      },
      { $unset: 'role' },
    ],
    { updatePipeline: true },
  ).catch(() => undefined);

  // Backfill hierarchy levels for legacy custom roles that predate hierarchy enforcement.
  const missingHierarchy = await RoleDefinition.find({ hierarchyLevel: { $exists: false } })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .catch(() => []);
  if (missingHierarchy.length > 0) {
    const allWithHierarchy = await RoleDefinition.find({ hierarchyLevel: { $exists: true } })
      .select('hierarchyLevel')
      .lean()
      .catch(() => []);
    const used = new Set<number>();
    for (const row of allWithHierarchy) {
      if (typeof row.hierarchyLevel === 'number' && Number.isFinite(row.hierarchyLevel)) {
        used.add(row.hierarchyLevel);
      }
    }
    let maxUsed = 1000;
    used.forEach((value) => {
      if (value > maxUsed) {
        maxUsed = value;
      }
    });
    let next = maxUsed + 1;
    for (const row of missingHierarchy) {
      while (used.has(next)) {
        next += 1;
      }
      await RoleDefinition.updateOne({ _id: row._id }, { $set: { hierarchyLevel: next } }).catch(() => undefined);
      used.add(next);
      next += 1;
    }
  }

  logger.info('Role definitions initialized');
}

export function isBuiltInRoleKey(key: string): key is BuiltInRoleKey {
  return key === 'admin' || key === 'manager' || key === 'viewer';
}

export function isValidCustomRoleKey(key: string): key is `custom:${string}` {
  if (!key.startsWith('custom:')) {
    return false;
  }
  const slug = key.slice('custom:'.length);
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
}

/** Workspace/board custom roles must not include app-admin or account capability keys. */
export function findForbiddenWorkspaceRolePermission(
  permissions: readonly string[],
): string | null {
  for (const permission of permissions) {
    if (permission.startsWith('app.') || permission.startsWith('users.')) {
      return permission;
    }
  }
  return null;
}

export async function getRoleHierarchyLevel(roleKey: string): Promise<number | null> {
  const trimmed = roleKey.trim();
  if (trimmed === '') {
    return null;
  }
  if (isBuiltInRoleKey(trimmed)) {
    return BUILTIN_ROLE_HIERARCHY_LEVELS[trimmed];
  }
  if (!isValidCustomRoleKey(trimmed)) {
    return null;
  }
  const role = await RoleDefinition.findOne({ key: trimmed })
    .select('hierarchyLevel')
    .lean()
    .catch(() => null);
  return typeof role?.hierarchyLevel === 'number' && Number.isFinite(role.hierarchyLevel)
    ? role.hierarchyLevel
    : null;
}

export function resolveBoardMemberRoleUpdateModeFromPermissions(
  permissions: readonly string[],
): BoardMemberRoleUpdateModeKey | null {
  const set = new Set(permissions);
  if (set.has('boards.members.role.update.any')) {
    return 'boards.members.role.update.any';
  }
  if (set.has('boards.members.role.update.samehigher')) {
    return 'boards.members.role.update.samehigher';
  }
  if (set.has('boards.members.role.update.samelower')) {
    return 'boards.members.role.update.samelower';
  }
  if (set.has('boards.members.role.update.higher')) {
    return 'boards.members.role.update.higher';
  }
  if (set.has('boards.members.role.update.lower')) {
    return 'boards.members.role.update.lower';
  }
  if (set.has('boards.members.role.update.same')) {
    return 'boards.members.role.update.same';
  }
  return null;
}

export function canAssignByBoardMemberRoleUpdateMode(args: {
  readonly mode: BoardMemberRoleUpdateModeKey;
  readonly actorLevel: number;
  readonly targetCurrentLevel: number;
  readonly targetNextLevel: number;
  readonly selfChange: boolean;
}): boolean {
  const { mode, actorLevel, targetCurrentLevel, targetNextLevel, selfChange } = args;
  if (!Number.isFinite(actorLevel) || !Number.isFinite(targetCurrentLevel) || !Number.isFinite(targetNextLevel)) {
    return false;
  }
  if (mode === 'boards.members.role.update.any') {
    return true;
  }
  if (selfChange) {
    return false;
  }
  const targetIsSame = targetCurrentLevel === actorLevel;
  const targetIsLower = targetCurrentLevel < actorLevel;
  const targetIsHigher = targetCurrentLevel > actorLevel;
  const nextIsSame = targetNextLevel === actorLevel;
  const nextIsLower = targetNextLevel < actorLevel;
  const nextIsHigher = targetNextLevel > actorLevel;
  switch (mode) {
    case 'boards.members.role.update.same':
      return targetIsSame && nextIsSame;
    case 'boards.members.role.update.lower':
      return targetIsLower && nextIsLower;
    case 'boards.members.role.update.higher':
      return targetIsHigher && nextIsHigher;
    case 'boards.members.role.update.samehigher':
      return (targetIsSame || targetIsHigher) && (nextIsSame || nextIsHigher);
    case 'boards.members.role.update.samelower':
      return (targetIsSame || targetIsLower) && (nextIsSame || nextIsLower);
    default:
      return false;
  }
}

