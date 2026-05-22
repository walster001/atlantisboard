/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  collectWekanReferencedUserIdsForBoard,
  extendSourceUsersById,
  stubImportPreflightUser,
} from '../src/server/services/import/importSourceUserCatalog.js';

describe('importSourceUserCatalog', () => {
  it('adds stub catalog rows for member ids missing from Wekan users[]', () => {
    const catalog = extendSourceUsersById(
      [{ sourceUserId: 'u1', email: 'a@example.com', fullName: 'A' }],
      ['u1', 'orphan-member-id'],
    );
    expect(catalog.size).toBe(2);
    expect(catalog.get('orphan-member-id')).toEqual(stubImportPreflightUser('orphan-member-id'));
  });

  it('collects user ids from board members, cards, comments, and attachments', () => {
    const ids = collectWekanReferencedUserIdsForBoard(
      {
        boards: [{ _id: 'b1', members: [{ userId: 'm1' }] }],
        cards: [
          { _id: 'c1', boardId: 'b1', members: ['m2'] },
          { _id: 'c2', boardId: 'b2', members: ['other'] },
        ],
        comments: [{ cardId: 'c1', userId: 'm3' }],
        attachments: [{ cardId: 'c1', userId: 'm4' }],
      },
      'b1',
    );
    expect([...ids].sort()).toEqual(['m1', 'm2', 'm3', 'm4'].sort());
  });
});
