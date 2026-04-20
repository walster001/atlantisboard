/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  buildTrelloImportPreflight,
  buildWekanImportPreflight,
  detectWekanLegacyInlineButtons,
} from '../src/shared/import/importPreflight.js';

describe('import preflight detection', () => {
  it('detects Wekan legacy inline buttons needing manual replacement and users', () => {
    const raw = {
      boards: [{ _id: 'b1', title: 'Board' }],
      users: [
        {
          _id: 'u1',
          username: 'alice',
          emails: [{ address: 'alice@example.com' }],
          profile: { fullname: 'Alice' },
        },
      ],
      cards: [
        {
          _id: 'c1',
          title: 'Card',
          description:
            "<span style='display:inline-flex;'><img src='/cdn/storage/icons/old-icon.png'><a href='https://example.com'>Open Doc</a></span>",
        },
      ],
    };

    const preflight = buildWekanImportPreflight(raw);
    expect(preflight.source).toBe('wekan');
    expect(preflight.users.users).toHaveLength(1);
    expect(preflight.wekanButtons?.buttons).toHaveLength(1);
    expect(preflight.wekanButtons?.buttons[0].iconSrc).toBe('/cdn/storage/icons/old-icon.png');
  });

  it('extracts Trello members for import user management', () => {
    const raw = {
      boards: [{ id: 'b1', name: 'Board', prefs: {} }],
      lists: [],
      cards: [],
      members: [{ id: 'm1', fullName: 'Bob', email: 'bob@example.com', username: 'bob' }],
    };

    const preflight = buildTrelloImportPreflight(raw);
    expect(preflight.source).toBe('trello');
    expect(preflight.users.users).toEqual([
      {
        sourceUserId: 'm1',
        fullName: 'Bob',
        email: 'bob@example.com',
        username: 'bob',
      },
    ]);
  });

  it('returns empty when no legacy snippet exists', () => {
    const buttons = detectWekanLegacyInlineButtons([
      { _id: 'c1', description: 'Plain text description' },
    ]);
    expect(buttons).toEqual([]);
  });

  it('keeps /cdn/storage icon sources for replacement dialog', () => {
    const buttons = detectWekanLegacyInlineButtons([
      {
        _id: 'c1',
        description:
          "<span style='display:inline-flex;'><img src='/cdn/storage/custom/icon-1.png'><a href='https://example.com'>Open</a></span>",
      },
    ]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.iconSrc).toBe('/cdn/storage/custom/icon-1.png');
  });

  it('skips URL-based icon references that are auto-resolved', () => {
    const buttons = detectWekanLegacyInlineButtons([
      {
        _id: 'c1',
        description:
          "<span style='display:inline-flex;'><img src='https://assets.example.com/icons/open.png'><a href='https://example.com'>Open</a></span>",
      },
    ]);
    expect(buttons).toEqual([]);
  });
});
