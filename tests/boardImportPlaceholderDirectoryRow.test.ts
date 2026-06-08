import { describe, expect, it } from 'bun:test';

/** Mirrors listBoardImportPlaceholderDirectoryRows mapping for importRoleKey fallback. */
function mapPlaceholderDirectoryRow(row: {
  readonly roleKey: string;
  readonly importedRoleKey?: string;
}): { readonly roleKey: string; readonly importRoleKey: string } {
  return {
    roleKey: row.roleKey,
    importRoleKey:
      typeof row.importedRoleKey === 'string' && row.importedRoleKey.trim() !== ''
        ? row.importedRoleKey.trim()
        : row.roleKey,
  };
}

describe('board import placeholder directory row', () => {
  it('uses importedRoleKey for display when present', () => {
    const mapped = mapPlaceholderDirectoryRow({
      roleKey: 'viewer',
      importedRoleKey: 'manager',
    });
    expect(mapped.importRoleKey).toBe('manager');
    expect(mapped.roleKey).toBe('viewer');
  });

  it('falls back importRoleKey to roleKey for legacy placeholders', () => {
    const mapped = mapPlaceholderDirectoryRow({ roleKey: 'admin' });
    expect(mapped.importRoleKey).toBe('admin');
    expect(mapped.roleKey).toBe('admin');
  });
});
