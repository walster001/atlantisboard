/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS,
  BUILTIN_ROLE_SEEDS,
  MEMBERS_ROLE_UPDATE_MODE_KEYS,
  MEMBERS_ROLE_UPDATE_MODE_OPTIONS,
  PERMISSION_DESCRIPTIONS,
  permissionsForBuiltinRole,
} from '../src/shared/permissions/catalog.js';
import { BUILTIN_ROLE_SEEDS as ROLE_SERVICE_SEEDS } from '../src/server/services/roleService.js';

describe('permissions catalog parity', () => {
  it('keeps roleService seeds re-exported from the shared catalog', () => {
    expect(ROLE_SERVICE_SEEDS).toBe(BUILTIN_ROLE_SEEDS);
  });

  it('describes every permission referenced by built-in role seeds', () => {
    const keys = new Set<string>();
    for (const seed of BUILTIN_ROLE_SEEDS) {
      for (const permission of seed.permissions) {
        keys.add(permission);
      }
    }
    for (const key of keys) {
      expect(PERMISSION_DESCRIPTIONS[key]).toBeString();
      expect(PERMISSION_DESCRIPTIONS[key]?.length).toBeGreaterThan(0);
    }
  });

  it('aligns member role-update mode keys between server and admin UI', () => {
    expect(MEMBERS_ROLE_UPDATE_MODE_KEYS.size).toBe(BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS.length);
    for (const key of BOARD_MEMBER_ROLE_UPDATE_MODE_KEYS) {
      expect(MEMBERS_ROLE_UPDATE_MODE_KEYS.has(key)).toBe(true);
      expect(MEMBERS_ROLE_UPDATE_MODE_OPTIONS.some((option) => option.value === key)).toBe(true);
    }
  });

  it('exposes permissionsForBuiltinRole helper consistent with seeds', () => {
    expect(permissionsForBuiltinRole('admin')).toEqual(
      BUILTIN_ROLE_SEEDS.find((entry) => entry.key === 'admin')?.permissions ?? [],
    );
  });
});
