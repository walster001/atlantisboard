/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { markdownToCardDescriptionJson } from '../src/shared/utils/markdownToCardDescriptionJson.js';
import { repairLegacyWekanHtmlInCardDescriptionJson } from '../src/shared/import/repairLegacyWekanCardDescription.js';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';

const legacySpan =
  `<span style='border-radius:5px; background-color:#1D2125; padding:4px; position:relative; display:inline-flex;'>` +
  `<img src='/cdn/storage/attachments/x/original/x.png' width='16' height='16'>` +
  `<a style='color:#579DFF;' href='https://apps.apple.com/us/app/sepl2/id6468250931'>SEPL for IOS</a>` +
  `</span>`;

describe('repairLegacyWekanHtmlInCardDescriptionJson', () => {
  it('converts paragraphs that contain legacy HTML as literal text', () => {
    const broken = markdownToCardDescriptionJson(`**Apple (IOS)**\n\n${legacySpan}`);
    expect(broken).toBeDefined();
    expect(broken).toContain('<span');

    const repaired = repairLegacyWekanHtmlInCardDescriptionJson(broken!);
    expect(repaired).not.toBeNull();
    const doc = JSON.parse(repaired!) as unknown;
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
    expect(JSON.stringify(doc)).toContain('inlineButton');
    expect(JSON.stringify(doc)).not.toContain('<span');
  });
});
