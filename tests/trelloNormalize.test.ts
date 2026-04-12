import { describe, it, expect } from 'bun:test';
import { normalizeTrelloExport } from '../src/shared/import/trelloNormalize.js';

describe('normalizeTrelloExport', () => {
  it('normalizes legacy multi-board shape', () => {
    const raw = {
      boards: [{ id: 'b1', name: 'B1', closed: false }],
      lists: [{ id: 'l1', name: 'L1', idBoard: 'b1', pos: 1000, closed: false }],
      cards: [
        {
          id: 'c1',
          name: 'Card',
          idList: 'l1',
          idBoard: 'b1',
          pos: 2000,
          closed: false,
        },
      ],
      labels: [{ id: 'lab1', idBoard: 'b1', name: 'Bug', color: 'red' }],
    };
    const n = normalizeTrelloExport(raw);
    expect(n.boards).toHaveLength(1);
    expect(n.boards[0].id).toBe('b1');
    expect(n.lists).toHaveLength(1);
    expect(n.cards).toHaveLength(1);
    expect(n.labels).toHaveLength(1);
    expect(n.checklists).toEqual([]);
  });

  it('normalizes single-board-at-root export', () => {
    const raw = {
      id: 'board-root',
      name: 'Root board',
      closed: false,
      lists: [{ id: 'l1', name: 'Col', idBoard: 'board-root', pos: 1, closed: false }],
      cards: [
        {
          id: 'c1',
          name: 'Hi',
          desc: 'Hello',
          idList: 'l1',
          idBoard: 'board-root',
          pos: 2,
          closed: false,
        },
      ],
      labels: [],
      checklists: [],
    };
    const n = normalizeTrelloExport(raw);
    expect(n.boards).toHaveLength(1);
    expect(n.boards[0].id).toBe('board-root');
    expect(n.boards[0].name).toBe('Root board');
    expect(n.cards[0].desc).toBe('Hello');
  });

  it('throws on invalid root', () => {
    expect(() => normalizeTrelloExport(null)).toThrow();
    expect(() => normalizeTrelloExport([])).toThrow();
    expect(() => normalizeTrelloExport({})).toThrow();
  });

  it('preserves closed flag on cards for import filtering', () => {
    const raw = {
      id: 'b1',
      name: 'Board',
      lists: [{ id: 'l1', name: 'L', idBoard: 'b1', pos: 1, closed: false }],
      cards: [
        {
          id: 'c1',
          name: 'Archived',
          idList: 'l1',
          idBoard: 'b1',
          pos: 1,
          closed: true,
        },
      ],
    };
    const n = normalizeTrelloExport(raw);
    expect(n.cards).toHaveLength(1);
    expect(n.cards[0].closed).toBe(true);
  });

  it('coerces null or blank list names and missing list pos', () => {
    const raw = {
      id: 'b1',
      name: 'Board',
      lists: [
        { id: 'l1', name: null, idBoard: 'b1', pos: null, closed: false },
        { id: 'l2', name: '   ', idBoard: 'b1', closed: false },
      ],
      cards: [],
    };
    const n = normalizeTrelloExport(raw);
    expect(n.lists[0].name).toBe('Untitled list');
    expect(n.lists[0].pos).toBe(0);
    expect(n.lists[1].name).toBe('Untitled list');
    expect(n.lists[1].pos).toBe(0);
  });

  it('accepts Trello nulls for due, start, and attachment bytes', () => {
    const raw = {
      id: 'b1',
      name: 'Board',
      lists: [{ id: 'l1', name: 'L', idBoard: 'b1', pos: 1, closed: false }],
      cards: [
        {
          id: 'c1',
          name: 'Card',
          idList: 'l1',
          idBoard: 'b1',
          pos: 1,
          due: null,
          start: null,
          attachments: [{ id: 'a1', name: 'f', url: 'https://x/y', bytes: null, date: '2020-01-01' }],
        },
      ],
    };
    const n = normalizeTrelloExport(raw);
    expect(n.cards[0].due).toBeNull();
    expect(n.cards[0].start).toBeNull();
    expect(n.cards[0].attachments?.[0].bytes).toBeNull();
  });
});
