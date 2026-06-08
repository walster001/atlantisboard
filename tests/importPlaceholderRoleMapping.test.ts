/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { buildBoardImportPlaceholderInsertFields } from '../src/shared/import/boardImportPlaceholderInsert.js';
import { resolveImportBoardRoleFromSourceMapping } from '../src/shared/import/importSourceBoardRoles.js';

describe('placeholder import role mapping', () => {
  it('stores mapped roleKey on placeholder insert fields', () => {
    const roleKey = resolveImportBoardRoleFromSourceMapping(
      'admin',
      [{ sourceRoleKey: 'admin', targetRoleKey: 'manager' }],
      'viewer',
    );
    const fields = buildBoardImportPlaceholderInsertFields({
      sourceUser: { sourceUserId: 'u1', email: 'a@test.com', fullName: 'Alice' },
      roleKey,
    });
    expect(fields.roleKey).toBe('manager');
  });
});
