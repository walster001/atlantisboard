/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { enrichAtlantisboardExportUsers } from '../src/shared/export/enrichAtlantisboardExportUsers.js';

describe('enrichAtlantisboardExportUsers', () => {
  it('adds boardRoleKey from board members and admin for owner', () => {
    const users = enrichAtlantisboardExportUsers(
      [
        { id: 'owner-1', email: 'owner@test.com', username: 'owner', displayName: 'Owner' },
        { id: 'user-2', email: 'u2@test.com', username: 'u2', displayName: 'Member' },
        { id: 'user-3', email: 'u3@test.com', username: 'u3', displayName: 'Assignee' },
      ],
      {
        ownerId: 'owner-1',
        members: [
          { userId: { toString: () => 'owner-1' }, roleKey: 'admin' },
          { userId: { toString: () => 'user-2' }, roleKey: 'manager' },
        ],
      },
    );

    expect(users).toEqual([
      {
        id: 'owner-1',
        email: 'owner@test.com',
        username: 'owner',
        displayName: 'Owner',
        boardRoleKey: 'admin',
      },
      {
        id: 'user-2',
        email: 'u2@test.com',
        username: 'u2',
        displayName: 'Member',
        boardRoleKey: 'manager',
      },
      {
        id: 'user-3',
        email: 'u3@test.com',
        username: 'u3',
        displayName: 'Assignee',
      },
    ]);
  });
});
