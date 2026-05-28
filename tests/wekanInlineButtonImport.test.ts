/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { buildWekanImportPreflight } from '../src/shared/import/importPreflight.js';
import { wekanDescriptionToCardJson } from '../src/server/services/import/wekanImportService/description.js';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';

describe('Wekan inlineButton import', () => {
  it('detects legacy inline-flex HTML with normal quotes', () => {
    const html =
      `<span style="border-radius:5px; background-color:#1D2125; padding:4px; position:relative; display:inline-flex;">` +
      `<img align="center" style="padding-right:5px;" src="/cdn/storage/atlattachments/x/original/x.png" width="12" height="16">` +
      `<a style="text-decoration:none; color:#579DFF;" href="http://www.camhqinfo.com/">camhqinfo.com</a>` +
      `</span>`;

    const preflight = buildWekanImportPreflight({
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', description: html }],
      users: [],
    });

    expect(preflight.wekanButtons?.buttons.length).toBe(1);
    expect(preflight.wekanButtons?.buttons[0]?.href).toContain('camhqinfo.com');
  });

  it('detects legacy inline-flex HTML with &quot; attribute quotes', () => {
    const html =
      `<span style=&quot;border-radius:5px; background-color:#1D2125; padding:4px; position:relative; display:inline-flex;&quot;>` +
      `<img align=&quot;center&quot; style=&quot;padding-right:5px;&quot; src=&quot;/cdn/storage/atlattachments/x/original/x.png&quot; width=&quot;12&quot; height=&quot;16&quot;>` +
      `<a style=&quot;text-decoration:none; color:#579DFF;&quot; href=&quot;http://www.camhqinfo.com/&quot;>camhqinfo.com</a>` +
      `</span>`;

    const preflight = buildWekanImportPreflight({
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', description: html }],
      users: [],
    });

    expect(preflight.wekanButtons?.buttons.length).toBe(1);

    const json = wekanDescriptionToCardJson(html, new Map(), new Map());
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json) as unknown;
    expect(isValidCardDescriptionDoc(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).toContain('inlineButton');
  });
});

