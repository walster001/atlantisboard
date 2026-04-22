import { describe, expect, it } from 'bun:test';
import {
  BUILTIN_ROLE_SEEDS,
  canAssignByBoardMemberRoleUpdateMode,
  resolveBoardMemberRoleUpdateModeFromPermissions,
} from '../src/server/services/roleService.js';

describe('role hierarchy seeds', () => {
  it('uses unique hierarchy levels for built-in roles', () => {
    const levels = BUILTIN_ROLE_SEEDS.map((seed) => seed.hierarchyLevel);
    expect(new Set(levels).size).toBe(levels.length);
  });
});

describe('board role update mode resolution', () => {
  it('prefers any mode when multiple keys exist', () => {
    const mode = resolveBoardMemberRoleUpdateModeFromPermissions([
      'boards.members.role.update.same',
      'boards.members.role.update.any',
    ]);
    expect(mode).toBe('boards.members.role.update.any');
  });

  it('returns null without granular keys', () => {
    const mode = resolveBoardMemberRoleUpdateModeFromPermissions(['boards.members.role.update']);
    expect(mode).toBeNull();
  });
});

describe('board hierarchy mode checks', () => {
  const actor = 200;

  it('allows only same-level targets and assignments for same mode', () => {
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.same',
        actorLevel: actor,
        targetCurrentLevel: 200,
        targetNextLevel: 200,
        selfChange: false,
      }),
    ).toBe(true);
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.same',
        actorLevel: actor,
        targetCurrentLevel: 100,
        targetNextLevel: 100,
        selfChange: false,
      }),
    ).toBe(false);
  });

  it('allows lower targets only in samelower mode', () => {
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.samelower',
        actorLevel: actor,
        targetCurrentLevel: 100,
        targetNextLevel: 100,
        selfChange: false,
      }),
    ).toBe(true);
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.samelower',
        actorLevel: actor,
        targetCurrentLevel: 300,
        targetNextLevel: 100,
        selfChange: false,
      }),
    ).toBe(false);
  });

  it('rejects self changes for non-any modes', () => {
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.samelower',
        actorLevel: actor,
        targetCurrentLevel: 200,
        targetNextLevel: 100,
        selfChange: true,
      }),
    ).toBe(false);
  });

  it('allows any mode regardless of hierarchy direction', () => {
    expect(
      canAssignByBoardMemberRoleUpdateMode({
        mode: 'boards.members.role.update.any',
        actorLevel: actor,
        targetCurrentLevel: 300,
        targetNextLevel: 300,
        selfChange: true,
      }),
    ).toBe(true);
  });
});
