import { describe, expect, it } from 'bun:test';
import {
  adminBackupScopeRequestSchema,
  normalizeAdminBackupMinioPrefixes,
} from '../src/shared/constants/backupScope.js';
import {
  minioPrefixesToSelections,
  normalizeBackupScopeRequest,
  resolveBackupJobScope,
} from '../src/server/services/backupService/backupScope.js';

describe('backup scope helpers', () => {
  it('accepts database-only scope without minioPrefixes', () => {
    const parsed = adminBackupScopeRequestSchema.parse({ scope: 'database' });
    expect(parsed.scope).toBe('database');
    expect(parsed.minioPrefixes).toBeUndefined();
  });

  it('requires minioPrefixes when attachments scope is selected', () => {
    expect(() =>
      adminBackupScopeRequestSchema.parse({ scope: 'database_and_attachments', minioPrefixes: [] }),
    ).toThrow();
  });

  it('normalizes backup scope request to executor targets', () => {
    const normalized = normalizeBackupScopeRequest({
      scope: 'database_and_attachments',
      minioPrefixes: ['card-attachments', 'branding'],
    });
    expect(normalized.scope).toBe('database_and_attachments');
    expect(normalized.minioSelections).toEqual([
      { bucket: 'card-attachments', prefix: '' },
      { bucket: 'branding', prefix: '' },
    ]);
  });

  it('defaults missing minioPrefixes to all buckets', () => {
    const prefixes = normalizeAdminBackupMinioPrefixes(undefined);
    expect(prefixes.length).toBeGreaterThan(0);
    expect(minioPrefixesToSelections(prefixes).every((entry) => entry.prefix === '')).toBe(true);
  });

  it('resolves legacy jobs without stored scope as full backup', () => {
    const resolved = resolveBackupJobScope({});
    expect(resolved.scope).toBe('database_and_attachments');
    expect(resolved.minioSelections?.length).toBeGreaterThan(0);
  });

  it('resolves database-only stored jobs', () => {
    const resolved = resolveBackupJobScope({ backupScope: 'database' });
    expect(resolved.scope).toBe('database');
    expect(resolved.minioSelections).toBeNull();
  });
});
