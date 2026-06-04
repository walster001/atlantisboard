import {
  ACCOUNT_CAPABILITY_KEYS,
  type AccountCapabilityKey,
  flagsFromAccountCapabilities,
} from '../../shared/accountCapabilities.js';
import { RoleDefinition } from '../models/RoleDefinition.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { hasPermission } from '../utils/permissions.js';

export async function userHasAccountCapability(
  userId: string,
  capabilityKey: AccountCapabilityKey,
): Promise<boolean> {
  const user = await User.findById(userId).select('accountCapabilities').lean();
  if (!user) {
    return false;
  }
  const caps = user.accountCapabilities;
  return Array.isArray(caps) && caps.includes(capabilityKey);
}

export async function migrateAccountCapabilitiesFromWorkspaceRoles(): Promise<void> {
  const users = await User.find({ isAppAdmin: { $ne: true } })
    .select('_id accountCapabilities')
    .lean();

  for (const user of users) {
    const userId = String(user._id);
    const existing = new Set(
      Array.isArray(user.accountCapabilities) ? user.accountCapabilities : [],
    );
    const toAdd: AccountCapabilityKey[] = [];

    for (const key of ACCOUNT_CAPABILITY_KEYS) {
      if (existing.has(key)) {
        continue;
      }
      if (await userHadCapabilityViaWorkspaceRole(userId, key)) {
        toAdd.push(key);
      }
    }

    if (toAdd.length > 0) {
      await User.updateOne(
        { _id: user._id },
        { $addToSet: { accountCapabilities: { $each: toAdd } } },
      );
    }
  }
}

async function userHadCapabilityViaWorkspaceRole(
  userId: string,
  capabilityKey: AccountCapabilityKey,
): Promise<boolean> {
  const workspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  })
    .select('_id')
    .lean();

  for (const workspace of workspaces) {
    const workspaceId = String(workspace._id);
    if (await hasPermission(userId, workspaceId, capabilityKey, 'workspace')) {
      return true;
    }
  }
  return false;
}

export async function pullAccountCapabilitiesFromAllRoles(): Promise<void> {
  await RoleDefinition.updateMany(
    {
      permissions: {
        $in: [...ACCOUNT_CAPABILITY_KEYS],
      },
    },
    {
      $pull: {
        permissions: {
          $in: [...ACCOUNT_CAPABILITY_KEYS],
        },
      },
    },
  ).catch(() => undefined);
}

export function mapUserAccountCapabilityFlags(
  capabilities: readonly string[] | undefined,
  isAppAdmin: boolean,
): { readonly canImportBoards: boolean; readonly canCreateWorkspace: boolean } {
  if (isAppAdmin) {
    return { canImportBoards: true, canCreateWorkspace: true };
  }
  return flagsFromAccountCapabilities(capabilities);
}
