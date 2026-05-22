import { describe, expect, test } from 'bun:test';
import { mapWekanBoardMemberToBoardRoleKey } from '../src/shared/import/wekanBoardMemberRoleMap.js';

function base(
  overrides: Partial<Parameters<typeof mapWekanBoardMemberToBoardRoleKey>[0]> = {},
): Parameters<typeof mapWekanBoardMemberToBoardRoleKey>[0] {
  return {
    isAdmin: false,
    isCommentOnly: false,
    isNoComments: false,
    isWorker: false,
    isReadOnly: false,
    isReadAssignedOnly: false,
    isNormalAssignedOnly: false,
    isCommentAssignedOnly: false,
    ...overrides,
  };
}

describe('mapWekanBoardMemberToBoardRoleKey', () => {
  test('Wekan admin → manager', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ isAdmin: true }))).toBe('manager');
  });

  test('implicit normal member → viewer', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base())).toBe('viewer');
  });

  test('comment-only → viewer', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ isCommentOnly: true }))).toBe('viewer');
  });

  test('no-comments → viewer', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ isNoComments: true }))).toBe('viewer');
  });

  test('worker → viewer', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ isWorker: true }))).toBe('viewer');
  });

  test('string permission synonyms (commentsonly / nocomments / worker / normal / admin)', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'commentsonly' }))).toBe('viewer');
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'comment-only' }))).toBe('viewer');
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'NoComments' }))).toBe('viewer');
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'worker' }))).toBe('viewer');
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'normal' }))).toBe('viewer');
    expect(mapWekanBoardMemberToBoardRoleKey(base({ permission: 'admin' }))).toBe('manager');
  });

  test('isAdmin wins over permission string', () => {
    expect(
      mapWekanBoardMemberToBoardRoleKey(
        base({ isAdmin: true, permission: 'worker', isWorker: true }),
      ),
    ).toBe('manager');
  });

  test('isWorker wins over permission normal string', () => {
    expect(mapWekanBoardMemberToBoardRoleKey(base({ isWorker: true, permission: 'normal' }))).toBe(
      'viewer',
    );
  });
});
