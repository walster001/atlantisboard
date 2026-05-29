import { describe, expect, it } from 'bun:test';
import { collectImportInlineObjectNamesFromText } from '../src/server/services/importInlineAssetService.js';

describe('collectImportInlineObjectNamesFromText', () => {
  it('collects object stems from /api/v1/import-inline paths', () => {
    const names = new Set<string>();
    const id = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee1111';
    collectImportInlineObjectNamesFromText(
      JSON.stringify({
        type: 'inlineButton',
        attrs: { iconSrc: `/api/v1/import-inline/${id}.png` },
      }),
      names,
    );
    expect(names.has(`${id}.png`)).toBe(true);
  });

  it('collects object stems without /api/v1 prefix', () => {
    const names = new Set<string>();
    const id = 'bbbbbbbb-cccc-4ddd-eeee-ffffffff2222';
    collectImportInlineObjectNamesFromText(
      `icon":"/import-inline/${id}.jpg"`,
      names,
    );
    expect(names.has(`${id}.jpg`)).toBe(true);
  });
});
