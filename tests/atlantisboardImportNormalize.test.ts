/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { ATLANTISBOARD_EXPORT_FORMAT_VERSION } from '../src/shared/export/boardExportFormats.js';
import {
  assertAtlantisboardExportShape,
  AtlantisboardExportShapeError,
  isAtlantisboardExportShape,
  normalizeAtlantisboardExport,
} from '../src/shared/import/atlantisboardNormalize.js';

const minimalAtlantisboardExport = {
  format: ATLANTISBOARD_EXPORT_FORMAT_VERSION,
  board: {
    name: 'Sample Board',
    settings: { allowComments: true },
    members: [],
  },
  lists: [{ id: 'list-1', name: 'To Do', position: 0 }],
  cards: [{ id: 'card-1', listId: 'list-1', title: 'First card' }],
  labels: [{ id: 'label-1', name: 'Bug', color: '#ff0000' }],
};

describe('isAtlantisboardExportShape', () => {
  it('accepts native format version with board and lists', () => {
    expect(isAtlantisboardExportShape(minimalAtlantisboardExport)).toBe(true);
  });

  it('accepts format version even when cards array is empty', () => {
    const payload = {
      ...minimalAtlantisboardExport,
      cards: [],
    };
    expect(isAtlantisboardExportShape(payload)).toBe(true);
  });

  it('rejects Wekan-shaped exports without Atlantisboard markers', () => {
    const wekanLike = {
      boards: [{ _id: 'b1', title: 'Board' }],
      cards: [{ _id: 'c1', title: 'Card', listId: 'l1' }],
    };
    expect(isAtlantisboardExportShape(wekanLike)).toBe(false);
  });

  it('detects legacy shape via board.settings and list.name', () => {
    const legacy = {
      board: { name: 'Legacy', settings: { allowComments: true } },
      lists: [{ id: 'l1', name: 'Backlog' }],
      cards: [{ id: 'c1', listId: 'l1', title: 'Task' }],
    };
    expect(isAtlantisboardExportShape(legacy)).toBe(true);
  });
});

describe('normalizeAtlantisboardExport', () => {
  it('parses a minimal export', () => {
    const normalized = normalizeAtlantisboardExport(minimalAtlantisboardExport);
    expect(normalized.board.name).toBe('Sample Board');
    expect(normalized.lists).toHaveLength(1);
    expect(normalized.cards).toHaveLength(1);
    expect(normalized.labels).toHaveLength(1);
  });

  it('parses export users with optional boardRoleKey', () => {
    const normalized = normalizeAtlantisboardExport({
      ...minimalAtlantisboardExport,
      users: [
        {
          id: 'user-1',
          email: 'a@test.com',
          username: 'alice',
          displayName: 'Alice',
          boardRoleKey: 'manager',
        },
      ],
    });
    expect(normalized.users[0]?.boardRoleKey).toBe('manager');
  });

  it('throws AtlantisboardExportShapeError for invalid payloads', () => {
    expect(() => assertAtlantisboardExportShape({})).toThrow(AtlantisboardExportShapeError);
  });
});
