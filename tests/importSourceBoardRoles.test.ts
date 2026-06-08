/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  buildDefaultImportSourceRoleMappings,
  deriveWekanMemberSourceRoleKey,
  extractDistinctTrelloSourceBoardRoles,
  extractDistinctWekanSourceBoardRoles,
  resolveImportBoardRoleFromSourceMapping,
} from '../src/shared/import/importSourceBoardRoles.js';

describe('importSourceBoardRoles', () => {
  it('extracts distinct Wekan source roles including implicit normal', () => {
    const raw = {
      boards: [
        {
          _id: 'b1',
          members: [
            { userId: 'u1', isAdmin: true },
            { userId: 'u2', isCommentOnly: true },
          ],
        },
      ],
    };
    expect(extractDistinctWekanSourceBoardRoles(raw)).toEqual(['admin', 'comment-only', 'normal']);
  });

  it('extracts Trello memberships memberType values with default member', () => {
    const raw = {
      memberships: [
        { idBoard: 'b1', idMember: 'm1', memberType: 'observer' },
        { idBoard: 'b1', idMember: 'm2', memberType: 'admin' },
      ],
    };
    expect(extractDistinctTrelloSourceBoardRoles(raw)).toEqual(['admin', 'member', 'observer']);
  });

  it('applies user-provided source role mappings with fallback', () => {
    const mapped = resolveImportBoardRoleFromSourceMapping(
      'admin',
      [{ sourceRoleKey: 'admin', targetRoleKey: 'viewer' }],
      'manager',
    );
    expect(mapped).toBe('viewer');

    const fallback = resolveImportBoardRoleFromSourceMapping('worker', [], 'viewer');
    expect(fallback).toBe('viewer');
  });

  it('builds default mappings for Wekan roles', () => {
    expect(buildDefaultImportSourceRoleMappings('wekan', ['admin', 'normal'])).toEqual([
      { sourceRoleKey: 'admin', targetRoleKey: 'manager' },
      { sourceRoleKey: 'normal', targetRoleKey: 'viewer' },
    ]);
  });

  it('derives stable Wekan source role keys from member flags', () => {
    expect(deriveWekanMemberSourceRoleKey({ isAdmin: true })).toBe('admin');
    expect(deriveWekanMemberSourceRoleKey({ isAdmin: false, isNoComments: true })).toBe('no-comments');
  });
});
