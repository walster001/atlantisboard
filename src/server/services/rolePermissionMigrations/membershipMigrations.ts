import { Board } from '../../models/Board.js';
import { InviteLink } from '../../models/InviteLink.js';
import { Workspace } from '../../models/Workspace.js';

/** Idempotent membership roleKey migrations for boards, workspaces, and invites. */
export async function migrateMembershipRoleKeys(): Promise<void> {
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
}
