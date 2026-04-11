import { RoleDefinition } from '../models/RoleDefinition.js';
import { logger } from '../utils/logger.js';
import { Board } from '../models/Board.js';
import { InviteLink } from '../models/InviteLink.js';
import { Workspace } from '../models/Workspace.js';

export type BuiltInRoleKey = 'admin' | 'manager' | 'viewer';
export type RoleKey = BuiltInRoleKey | `custom:${string}`;

export interface BuiltInRoleSeed {
  readonly key: BuiltInRoleKey;
  readonly displayName: string;
  readonly permissions: readonly string[];
}

export const BUILTIN_ROLE_SEEDS: readonly BuiltInRoleSeed[] = [
  {
    key: 'admin',
    displayName: 'Admin',
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
      'export.board.json',
      'export.board.csv',
      'attachments.download_url.view',
      'attachments.file.stream',
      'invites.accept',
      'labels.view',
      'boards.members.view',
      'boards.members.add',
      'boards.members.remove',
      'boards.members.role.update',
      'boards.settings.open',
      'labels.create',
      'labels.update',
      'labels.delete',
      'invites.create',
      'invites.view',
      'invites.delete',
      'boards.update',
      'boards.settings.update',
      'boards.reorder_in_home',
      'boards.create',
      'lists.create',
      'lists.update',
      'lists.reorder',
      'lists.delete',
      'cards.create',
      'cards.update',
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
    ],
  },
  {
    key: 'manager',
    displayName: 'Manager',
    permissions: [
      'workspaces.view',
      'boards.view',
      'lists.view',
      'cards.view',
      'export.board.json',
      'export.board.csv',
      'attachments.download_url.view',
      'attachments.file.stream',
      'invites.accept',
      'labels.view',
      'boards.members.view',
      'boards.members.add',
      'boards.members.remove',
      'boards.members.role.update',
      'boards.settings.open',
      'lists.create',
      'lists.update',
      'lists.reorder',
      'boards.reorder_in_home',
      'cards.create',
      'cards.update',
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
    ],
  },
  {
    key: 'viewer',
    displayName: 'Viewer',
    permissions: [
      'workspaces.view',
      'boards.view',
      'lists.view',
      'cards.view',
      'export.board.json',
      'export.board.csv',
      'attachments.download_url.view',
      'attachments.file.stream',
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
      isBuiltIn: true,
    });
  }

  // Remove legacy built-in role "member" (treat as viewer).
  await RoleDefinition.deleteOne({ key: 'member', isBuiltIn: true }).catch(() => undefined);

  await RoleDefinition.updateMany(
    { key: { $in: ['admin', 'manager'] }, isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: ['comments.delete', 'cards.duplicate', 'boards.reorder_in_home'],
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

