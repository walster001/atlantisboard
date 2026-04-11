import { describe, expect, it } from 'bun:test';
import { isBuiltInRoleKey, isValidCustomRoleKey } from '../src/server/services/roleService.js';

describe('role keys', () => {
  it('recognizes built-in role keys', () => {
    expect(isBuiltInRoleKey('admin')).toBe(true);
    expect(isBuiltInRoleKey('manager')).toBe(true);
    expect(isBuiltInRoleKey('viewer')).toBe(true);
    expect(isBuiltInRoleKey('custom:abc')).toBe(false);
  });

  it('validates custom role keys (custom:<slug>)', () => {
    expect(isValidCustomRoleKey('custom:my-role')).toBe(true);
    expect(isValidCustomRoleKey('custom:role-1')).toBe(true);
    expect(isValidCustomRoleKey('custom:abc')).toBe(true);
    expect(isValidCustomRoleKey('custom:a')).toBe(false);
    expect(isValidCustomRoleKey('custom:-bad')).toBe(false);
    expect(isValidCustomRoleKey('custom:bad_underscore')).toBe(false);
    expect(isValidCustomRoleKey('admin')).toBe(false);
  });
});

