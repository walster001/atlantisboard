/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertImportJsonMatchesSource,
  detectImportJsonSource,
  ImportJsonSourceMismatchError,
} from '../src/shared/import/detectImportJsonSource.js';

const trelloFixturePath = join(
  import.meta.dir,
  '../src/server/services/import/__fixtures__/trello-single-board-min.json',
);

describe('detectImportJsonSource', () => {
  it('classifies Trello fixture as trello', () => {
    const raw = JSON.parse(readFileSync(trelloFixturePath, 'utf-8')) as unknown;
    expect(detectImportJsonSource(raw)).toBe('trello');
  });

  it('classifies minimal Wekan-shaped export as wekan', () => {
    const raw = {
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', listId: 'l1' }],
    };
    expect(detectImportJsonSource(raw)).toBe('wekan');
  });

  it('classifies _format wekan hint', () => {
    const raw = { _format: 'wekan-board-json', boards: [] };
    expect(detectImportJsonSource(raw)).toBe('wekan');
  });

  it('throws when payload is too ambiguous', () => {
    expect(() => detectImportJsonSource({})).toThrow(/Could not tell/);
  });

  it('assertImportJsonMatchesSource throws ImportJsonSourceMismatchError on mismatch', () => {
    const wekanLike = {
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', listId: 'l1' }],
    };
    expect(() => assertImportJsonMatchesSource(wekanLike, 'trello')).toThrow(ImportJsonSourceMismatchError);
    try {
      assertImportJsonMatchesSource(wekanLike, 'trello');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportJsonSourceMismatchError);
      if (e instanceof ImportJsonSourceMismatchError) {
        expect(e.expected).toBe('trello');
        expect(e.detected).toBe('wekan');
      }
    }
  });
});
