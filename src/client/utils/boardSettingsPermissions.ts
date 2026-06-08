import type { BoardPermissionKey } from '../hooks/useBoardPermissions.js';

type BoardSettingsGate = {
  canManageBoardSettings: boolean;
  canManageBoardMembers: boolean;
  canChangeTheme: boolean;
  canManageCustomThemes: boolean;
  canViewActivityLog: boolean;
  canOpenSettings: boolean;
};

export function resolveBoardSettingsGate(
  can: (key: BoardPermissionKey) => boolean,
): BoardSettingsGate {
  const canChangeTheme = can('boards.themes.changetheme');
  const canManageCustomThemes = can('boards.themes.customtheme');
  const canManageBoardSettings = can('boards.update') || can('boards.settings.update') || canChangeTheme;
  const canManageBoardMembers =
    can('boards.members.add') || can('boards.members.remove') || can('boards.members.role.update');
  const canViewActivityLog = can('boards.settings.activitylog');
  return {
    canManageBoardSettings,
    canManageBoardMembers,
    canChangeTheme,
    canManageCustomThemes,
    canViewActivityLog,
    canOpenSettings: canManageBoardSettings || canManageBoardMembers || canViewActivityLog,
  };
}
