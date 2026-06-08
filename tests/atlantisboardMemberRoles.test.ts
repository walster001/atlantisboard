/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  buildAtlantisboardUserRoleKeyById,
  collectAtlantisboardImportMemberRoleKeys,
  resolveAtlantisboardImportMemberRoleKey,
} from '../src/shared/import/atlantisboardMemberRoles.js';

describe('atlantisboardMemberRoles', () => {
  const users = [
    { id: 'user-a', boardRoleKey: 'manager' },
    { id: 'user-b', boardRoleKey: 'custom:designer' },
    { id: 'user-c' },
  ];
  const userRoleKeyById = buildAtlantisboardUserRoleKeyById(users);

  it('prefers users[].boardRoleKey over board.members[].roleKey', () => {
    expect(
      resolveAtlantisboardImportMemberRoleKey('user-a', userRoleKeyById, 'viewer'),
    ).toBe('manager');
  });

  it('falls back to board.members[].roleKey when users[] omits boardRoleKey', () => {
    expect(
      resolveAtlantisboardImportMemberRoleKey('user-c', userRoleKeyById, 'admin'),
    ).toBe('admin');
  });

  it('defaults to viewer when neither source provides a role', () => {
    expect(
      resolveAtlantisboardImportMemberRoleKey('unknown', userRoleKeyById, undefined),
    ).toBe('viewer');
  });

  it('collects distinct resolved member role keys including importer admin', () => {
    const keys = collectAtlantisboardImportMemberRoleKeys(
      {
        users,
        board: {
          members: [
            { userId: 'importer-1', roleKey: 'viewer' },
            { userId: 'user-a', roleKey: 'viewer' },
            { userId: 'user-b', roleKey: 'viewer' },
          ],
        },
      },
      'importer-1',
    );
    expect([...keys].sort()).toEqual(['admin', 'custom:designer', 'manager']);
  });
});
