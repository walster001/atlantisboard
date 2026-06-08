/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { resolveBoardSettingsGate } from '../src/client/utils/boardSettingsPermissions.js';
import type { BoardPermissionKey } from '../src/client/hooks/useBoardPermissions.js';

function canFromKeys(keys: readonly BoardPermissionKey[]): (key: BoardPermissionKey) => boolean {
  const set = new Set<BoardPermissionKey>(keys);
  return (key: BoardPermissionKey) => set.has(key);
}

describe('board settings permission gate', () => {
  it('hides settings for viewer-style access with only view permissions', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.members.view']),
    );
    expect(gate.canOpenSettings).toBe(false);
    expect(gate.canManageBoardSettings).toBe(false);
    expect(gate.canManageBoardMembers).toBe(false);
  });

  it('shows settings for board settings editors', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.settings.update']),
    );
    expect(gate.canOpenSettings).toBe(true);
    expect(gate.canManageBoardSettings).toBe(true);
    expect(gate.canChangeTheme).toBe(false);
    expect(gate.canManageCustomThemes).toBe(false);
  });

  it('shows settings for member managers and limits to users tab', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.members.add']),
    );
    expect(gate.canOpenSettings).toBe(true);
    expect(gate.canManageBoardSettings).toBe(false);
    expect(gate.canManageBoardMembers).toBe(true);
  });

  it('shows settings + theme capability for theme change permission', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.themes.changetheme']),
    );
    expect(gate.canOpenSettings).toBe(true);
    expect(gate.canManageBoardSettings).toBe(true);
    expect(gate.canChangeTheme).toBe(true);
    expect(gate.canManageCustomThemes).toBe(false);
  });

  it('enables custom theme controls only with custom theme permission', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.themes.customtheme']),
    );
    expect(gate.canManageCustomThemes).toBe(true);
    expect(gate.canChangeTheme).toBe(false);
  });

  it('opens settings for activity log viewers without other settings permissions', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.settings.activitylog']),
    );
    expect(gate.canOpenSettings).toBe(true);
    expect(gate.canViewActivityLog).toBe(true);
    expect(gate.canManageBoardSettings).toBe(false);
    expect(gate.canManageBoardMembers).toBe(false);
  });

  it('does not grant activity log visibility without boards.settings.activitylog', () => {
    const gate = resolveBoardSettingsGate(
      canFromKeys(['boards.view', 'boards.settings.update']),
    );
    expect(gate.canViewActivityLog).toBe(false);
  });
});
