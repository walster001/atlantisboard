/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  assertWekanInlineButtonReplacementsComplete,
  countResolvedWekanIconReplacements,
  getRequiredWekanReplacementIconSrcs,
  normalizeInlineButtonIconSrcKey,
} from '../src/shared/import/importPreflight.js';
import { buildWekanImportPreflight } from '../src/shared/import/importPreflight.js';

const LEGACY_BUTTON_HTML = (iconSrc: string): string =>
  `<span style="border-radius:5px; background-color:#1D2125; padding:4px; position:relative; display:inline-flex;">` +
  `<img align="center" style="padding-right:5px;" src="${iconSrc}" width="12" height="16">` +
  `<a style="text-decoration:none; color:#579DFF;" href="http://example.com/">Example</a>` +
  `</span>`;

describe('Wekan icon replacement preflight', () => {
  it('counts only replacements that match required icon sources for the current file', () => {
    const preflight = buildWekanImportPreflight({
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', description: LEGACY_BUTTON_HTML('/cdn/storage/a/icon.png') }],
      users: [],
    });
    const required = getRequiredWekanReplacementIconSrcs(preflight.wekanButtons?.buttons ?? []);
    expect(required).toEqual(['/cdn/storage/a/icon.png']);

    const staleFromPriorImport = [
      { iconSrc: '/cdn/storage/old-import/icon.png', replacementDataUrl: 'data:image/png;base64,abc=' },
    ];
    expect(countResolvedWekanIconReplacements(required, staleFromPriorImport)).toBe(0);

    const resolved = countResolvedWekanIconReplacements(required, [
      { iconSrc: '/cdn/storage/a/icon.png', replacementDataUrl: 'data:image/png;base64,abc=' },
    ]);
    expect(resolved).toBe(1);
  });

  it('matches icon sources after trim and URI decoding', () => {
    const encoded = '/cdn/storage/a/icon%20one.png';
    const required = [normalizeInlineButtonIconSrcKey(encoded)];
    const resolved = countResolvedWekanIconReplacements(required, [
      { iconSrc: `  ${encoded}  `, replacementDataUrl: 'data:image/png;base64,abc=' },
    ]);
    expect(resolved).toBe(1);
  });

  it('requires every legacy /cdn/storage/ icon before import', () => {
    const cards = [
      {
        _id: 'c1',
        title: 'Card',
        description: LEGACY_BUTTON_HTML('/cdn/storage/a/icon.png'),
      },
    ];
    expect(() =>
      assertWekanInlineButtonReplacementsComplete(cards, [
        { iconSrc: '/cdn/storage/a/icon.png', replacementDataUrl: '' },
      ]),
    ).toThrow(/remaining/);

    expect(() =>
      assertWekanInlineButtonReplacementsComplete(cards, [
        { iconSrc: '/cdn/storage/a/icon.png', replacementDataUrl: 'data:image/png;base64,abc=' },
      ]),
    ).not.toThrow();
  });
});
