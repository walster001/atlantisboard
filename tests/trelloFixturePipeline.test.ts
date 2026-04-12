import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTrelloExport } from '../src/shared/import/trelloNormalize.js';
import { markdownToCardDescriptionJson } from '../src/shared/utils/markdownToCardDescriptionJson.js';
import { trelloColorKeyToHex, trelloLabelDisplayName } from '../src/shared/import/trelloLabelColors.js';
import { isValidCardDescriptionDoc } from '../src/shared/validation/cardDescriptionDoc.js';

const fixturePath = join(
  import.meta.dir,
  '../src/server/services/import/__fixtures__/trello-single-board-min.json'
);

describe('Trello fixture pipeline', () => {
  it('normalizes fixture single-board JSON', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8')) as unknown;
    const n = normalizeTrelloExport(raw);
    expect(n.boards).toHaveLength(1);
    expect(n.cards).toHaveLength(1);
    expect(n.labels?.length).toBe(1);
    expect(n.checklists).toHaveLength(1);
    expect(n.checklists[0].checkItems).toHaveLength(2);
  });

  it('maps fixture card description through markdown + smart links', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
      cards: Array<{ desc: string }>;
    };
    const json = markdownToCardDescriptionJson(raw.cards[0].desc);
    expect(json).toBeDefined();
    const doc = JSON.parse(json!) as { content: Array<{ type: string }> };
    expect(isValidCardDescriptionDoc(doc)).toBe(true);
    expect(doc.content.some((b) => b.type === 'inlineButton')).toBe(true);
  });

  it('maps fixture label colour and display name', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
      labels: Array<{ name?: string; color?: string | null }>;
    };
    const lab = raw.labels[0];
    expect(trelloColorKeyToHex(lab.color ?? null).startsWith('#')).toBe(true);
    expect(trelloLabelDisplayName(lab.name, lab.color ?? null)).toBe('blue');
  });
});
