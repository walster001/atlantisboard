import { describe, expect, test } from 'bun:test';
import { buildBoardImportPlaceholderInsertFields } from '../src/shared/import/boardImportPlaceholderInsert.js';

describe('buildBoardImportPlaceholderInsertFields', () => {
  test('uses full name and normalizes email', () => {
    const fields = buildBoardImportPlaceholderInsertFields({
      sourceUser: {
        sourceUserId: 'wekan-1',
        fullName: 'Alex Example',
        email: 'Alex@Example.com',
      },
      roleKey: 'viewer',
    });
    expect(fields.displayName).toBe('Alex Example');
    expect(fields.email).toBe('alex@example.com');
    expect(fields.roleKey).toBe('viewer');
  });

  test('falls back to username for display name', () => {
    const fields = buildBoardImportPlaceholderInsertFields({
      sourceUser: {
        sourceUserId: 'id-9',
        username: 'member9',
      },
      roleKey: 'manager',
    });
    expect(fields.displayName).toBe('member9');
    expect(fields.importUsername).toBe('member9');
  });
});
