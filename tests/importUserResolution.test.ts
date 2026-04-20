import { describe, expect, it } from 'bun:test';
import { resolveImportUserResolution } from '../src/shared/import/importUserResolution.js';

describe('resolveImportUserResolution', () => {
  const importerUserId = 'importer-1';

  it('prefers explicit mapped user over all fallbacks', () => {
    const result = resolveImportUserResolution({
      decision: { sourceUserId: 's1', mappedUserId: 'mapped-1' },
      autoMatchedUserId: 'auto-1',
      policy: 'discard_unmapped',
      importerUserId,
    });
    expect(result).toEqual({ kind: 'map', userId: 'mapped-1' });
  });

  it('respects explicit discard decision', () => {
    const result = resolveImportUserResolution({
      decision: { sourceUserId: 's1', discard: true },
      autoMatchedUserId: 'auto-1',
      policy: 'map_to_importer',
      importerUserId,
    });
    expect(result).toEqual({ kind: 'discard' });
  });

  it('maps unresolved users to importer by default (no placeholder path)', () => {
    const result = resolveImportUserResolution({
      policy: 'map_to_importer',
      importerUserId,
    });
    expect(result).toEqual({ kind: 'map', userId: importerUserId });
  });

  it('returns create_placeholder only when policy demands it', () => {
    const result = resolveImportUserResolution({
      policy: 'create_placeholders',
      importerUserId,
    });
    expect(result).toEqual({ kind: 'create_placeholder' });
  });
});
