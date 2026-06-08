/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  BOARD_PERMISSION_KEYS,
  BUILTIN_ROLE_SEEDS,
  PERMISSION_DESCRIPTIONS,
  permissionsForBuiltinRole,
} from '../src/shared/permissions/catalog.js';

describe('boards.settings.activitylog permission', () => {
  it('is described in the permission catalog', () => {
    expect(PERMISSION_DESCRIPTIONS['boards.settings.activitylog']).toBe(
      'View the board Activity Log in Board Settings.',
    );
  });

  it('is seeded for admin and manager only', () => {
    const admin = permissionsForBuiltinRole('admin');
    const manager = permissionsForBuiltinRole('manager');
    const viewer = permissionsForBuiltinRole('viewer');

    expect(admin).toContain('boards.settings.activitylog');
    expect(manager).toContain('boards.settings.activitylog');
    expect(viewer).not.toContain('boards.settings.activitylog');
  });

  it('is included in built-in role seed documents', () => {
    for (const roleKey of ['admin', 'manager'] as const) {
      const seed = BUILTIN_ROLE_SEEDS.find((entry) => entry.key === roleKey);
      expect(seed?.permissions).toContain('boards.settings.activitylog');
    }
    const viewer = BUILTIN_ROLE_SEEDS.find((entry) => entry.key === 'viewer');
    expect(viewer?.permissions).not.toContain('boards.settings.activitylog');
  });

  it('is probed on the board page permission keys list', () => {
    expect(BOARD_PERMISSION_KEYS).toContain('boards.settings.activitylog');
  });
});
