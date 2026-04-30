import type { BoardPermissionKey } from '../hooks/useBoardPermissions.js';

type BoardSettingsGate = {
  canManageBoardSettings: boolean;
  canManageBoardMembers: boolean;
  canOpenSettings: boolean;
};

export function resolveBoardSettingsGate(
  can: (key: BoardPermissionKey) => boolean,
): BoardSettingsGate {
  const canManageBoardSettings = can('boards.update') || can('boards.settings.update');
  const canManageBoardMembers =
    can('boards.members.add') || can('boards.members.remove') || can('boards.members.role.update');
  return {
    canManageBoardSettings,
    canManageBoardMembers,
    canOpenSettings: canManageBoardSettings || canManageBoardMembers,
  };
}
