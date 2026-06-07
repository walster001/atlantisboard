/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILTIN_ROLE_SEEDS,
  permissionsForBuiltinRole,
} from '../src/shared/permissions/catalog.js';
import { BUILTIN_ROLE_SEEDS as ROLE_SEEDS_FROM_SERVICE } from '../src/server/services/roleSeeds.js';

const DEPRECATED_BUILTIN_ROLE_PERMISSION_KEYS = [
  'export.board.json',
  'import.display',
  'workspaces.create',
  'import.trello.start',
  'import.wekan.start',
  'import.csv.start',
  'import.jobs.view_own',
  'boards.reorder_in_home',
  'boards.view_kanban_snapshot',
  'ui.boards.settings.open',
  'attachments.file.stream',
  'attachments.download_url.view',
  'member',
] as const;

function sortedPermissions(roleKey: 'admin' | 'manager' | 'viewer'): readonly string[] {
  return [...permissionsForBuiltinRole(roleKey)].sort();
}

describe('built-in role catalog sync target', () => {
  it('re-exports catalog seeds from roleSeeds service module', () => {
    expect(ROLE_SEEDS_FROM_SERVICE).toBe(BUILTIN_ROLE_SEEDS);
  });

  it('defines admin, manager, and viewer seeds only', () => {
    expect(BUILTIN_ROLE_SEEDS.map((seed) => seed.key)).toEqual(['admin', 'manager', 'viewer']);
  });

  it('excludes deprecated permission keys from catalog seeds', () => {
    const deprecated = new Set<string>(DEPRECATED_BUILTIN_ROLE_PERMISSION_KEYS);
    for (const seed of BUILTIN_ROLE_SEEDS) {
      for (const permission of seed.permissions) {
        expect(deprecated.has(permission)).toBe(false);
      }
    }
  });

  it('uses a stable permission set per role (idempotent sync target)', () => {
    for (const roleKey of ['admin', 'manager', 'viewer'] as const) {
      const first = sortedPermissions(roleKey);
      const second = sortedPermissions(roleKey);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(0);
    }
  });

  it('assigns member role-update mode keys only where intended', () => {
    const admin = permissionsForBuiltinRole('admin');
    const manager = permissionsForBuiltinRole('manager');
    const viewer = permissionsForBuiltinRole('viewer');

    expect(admin).toContain('boards.members.role.update');
    expect(admin).toContain('boards.members.role.update.any');
    expect(admin).not.toContain('boards.members.role.update.lower');

    expect(manager).toContain('boards.members.role.update.lower');
    expect(manager).not.toContain('boards.members.role.update');
    expect(manager).not.toContain('boards.members.role.update.any');

    for (const key of [
      'boards.members.role.update',
      'boards.members.role.update.same',
      'boards.members.role.update.lower',
      'boards.members.role.update.higher',
      'boards.members.role.update.samehigher',
      'boards.members.role.update.samelower',
      'boards.members.role.update.any',
    ] as const) {
      expect(viewer).not.toContain(key);
    }
  });

  it('includes per-format export and import keys for admin and manager', () => {
    for (const roleKey of ['admin', 'manager'] as const) {
      const perms = permissionsForBuiltinRole(roleKey);
      expect(perms).toContain('export.board.atlantisboard');
      expect(perms).toContain('import.atlantisboard');
      expect(perms).toContain('import.trello');
      expect(perms).toContain('import.wekan');
    }
  });

  it('documents catalog sync as canonical reconciliation in roleSeeds', () => {
    const roleSeedsSource = readFileSync(join(process.cwd(), 'src/server/services/roleSeeds.ts'), 'utf8');
    expect(roleSeedsSource).toContain('syncBuiltinRolePermissionsFromCatalog');
    expect(roleSeedsSource).toContain('catalog is canonical');
  });
});
