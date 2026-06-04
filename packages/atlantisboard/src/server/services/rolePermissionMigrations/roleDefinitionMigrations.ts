import { RoleDefinition } from '../../models/RoleDefinition.js';
import { LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY } from '../../../shared/export/boardExportPermissions.js';

/** Idempotent RoleDefinition permission migrations. */
export async function migrateRoleDefinitionPermissions(): Promise<void> {
  await RoleDefinition.updateMany(
    { key: 'admin', isBuiltIn: true },
    {
      $addToSet: {
        permissions: {
          $each: ['comments.delete', 'cards.duplicate', 'lists.duplicate'],
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

  await RoleDefinition.updateMany(
    { key: { $in: ['admin', 'manager'] }, isBuiltIn: true },
    {
      $addToSet: {
        permissions: 'import.atlantisboard',
      },
    },
  ).catch(() => undefined);

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
  } = await import('../accountCapabilitiesService.js');
  await migrateAccountCapabilitiesFromWorkspaceRoles();
  await pullAccountCapabilitiesFromAllRoles();

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
}
