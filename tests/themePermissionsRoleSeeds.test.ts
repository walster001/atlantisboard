/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { BUILTIN_ROLE_SEEDS, permissionsForBuiltinRole } from '../src/shared/permissions/catalog.js';

function permissionsFor(roleKey: 'admin' | 'manager' | 'viewer'): readonly string[] {
  const role = BUILTIN_ROLE_SEEDS.find((entry) => entry.key === roleKey);
  expect(role).toBeDefined();
  return permissionsForBuiltinRole(roleKey);
}

describe('theme permission role seeds', () => {
  it('assigns both theme permissions to admin only', () => {
    const admin = permissionsFor('admin');
    const manager = permissionsFor('manager');
    const viewer = permissionsFor('viewer');

    expect(admin).toContain('boards.themes.changetheme');
    expect(admin).toContain('boards.themes.customtheme');
    expect(manager).not.toContain('boards.themes.changetheme');
    expect(manager).not.toContain('boards.themes.customtheme');
    expect(viewer).not.toContain('boards.themes.changetheme');
    expect(viewer).not.toContain('boards.themes.customtheme');
  });

  it('keeps compatibility anchor permission for migration backfill', () => {
    const admin = permissionsFor('admin');
    expect(admin).toContain('boards.settings.update');
  });

  it('does not assign account capabilities to built-in workspace roles', () => {
    const admin = permissionsFor('admin');
    const manager = permissionsFor('manager');
    const viewer = permissionsFor('viewer');

    expect(admin).not.toContain('import.display');
    expect(admin).not.toContain('workspaces.create');
    expect(manager).not.toContain('import.display');
    expect(manager).not.toContain('workspaces.create');
    expect(viewer).not.toContain('import.display');
    expect(viewer).not.toContain('workspaces.create');
  });

  it('withholds duplicate and invite list from built-in manager', () => {
    const manager = permissionsFor('manager');
    const admin = permissionsFor('admin');

    expect(manager).not.toContain('cards.duplicate');
    expect(manager).not.toContain('lists.duplicate');
    expect(manager).not.toContain('invites.view');
    expect(admin).toContain('cards.duplicate');
    expect(admin).toContain('lists.duplicate');
    expect(admin).toContain('invites.view');
  });

  it('assigns per-format export permissions to all built-in roles', () => {
    for (const roleKey of ['admin', 'manager', 'viewer'] as const) {
      const perms = permissionsFor(roleKey);
      expect(perms).toContain('export.board.csv');
      expect(perms).toContain('export.board.trello');
      expect(perms).toContain('export.board.wekan');
      expect(perms).toContain('export.board.atlantisboard');
      expect(perms).not.toContain('export.board.json');
    }
  });
});
