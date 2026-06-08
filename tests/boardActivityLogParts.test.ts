/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  humanReadableLabel,
  listLabelFromMeta,
  parseBoardActivityRow,
} from '../src/client/components/activities/boardActivityLogParts.js';

describe('board activity log row parsing', () => {
  it('parses a card.created row with actor and metadata', () => {
    const row = parseBoardActivityRow({
      _id: 'act-1',
      type: 'card.created',
      createdAt: '2026-06-08T12:00:00.000Z',
      userId: { displayName: 'Alice' },
      metadata: {
        entityId: 'card-1',
        entityName: 'Ship feature',
        listId: 'list-1',
      },
    });

    expect(row).not.toBeNull();
    expect(row?.type).toBe('card.created');
    expect(row?.actorName).toBe('Alice');
    expect(row?.meta.entityName).toBe('Ship feature');
  });

  it('parses card.moved with list metadata', () => {
    const row = parseBoardActivityRow({
      _id: 'act-2',
      type: 'card.moved',
      createdAt: Date.now(),
      userId: { displayName: 'Bob' },
      metadata: {
        entityName: 'Fix bug',
        cardTitle: 'Fix bug',
        listName: 'Done',
        previousListName: 'To Do',
        nextListName: 'Done',
      },
    });

    expect(row?.type).toBe('card.moved');
    expect(row?.meta.listName).toBe('Done');
    expect(listLabelFromMeta(row!.meta, 'previousListName', 'previous')).toBe('To Do');
    expect(listLabelFromMeta(row!.meta, 'nextListName', 'next')).toBe('Done');
  });

  it('hides legacy mongo object ids in list labels', () => {
    const legacyMeta = {
      previous: '6a183a4f8e328e550a76d285',
      next: '6a183a4f8e328e550a76d286',
    };
    expect(listLabelFromMeta(legacyMeta, 'previousListName', 'previous')).toBe('Unknown list');
    expect(listLabelFromMeta(legacyMeta, 'nextListName', 'next')).toBe('Unknown list');
    expect(humanReadableLabel('6a183a4f8e328e550a76d285', 'Unknown list')).toBe('Unknown list');
  });

  it('parses card.dates.updated rows', () => {
    const row = parseBoardActivityRow({
      _id: 'act-3',
      type: 'card.dates.updated',
      createdAt: Date.now(),
      userId: { displayName: 'Carol' },
      metadata: {
        entityName: 'Release',
        field: 'dueDate',
        previous: '2026-06-01',
        next: '2026-06-15',
      },
    });

    expect(row?.type).toBe('card.dates.updated');
    expect(row?.meta.field).toBe('dueDate');
  });

  it('rejects member audit and unknown activity types', () => {
    expect(
      parseBoardActivityRow({
        type: 'board.member.add',
        createdAt: Date.now(),
        userId: { displayName: 'Dave' },
        metadata: {},
      }),
    ).toBeNull();

    expect(
      parseBoardActivityRow({
        type: 'unknown.event',
        createdAt: Date.now(),
        userId: { displayName: 'Dave' },
        metadata: {},
      }),
    ).toBeNull();
  });

  it('rejects rows with invalid timestamps', () => {
    expect(
      parseBoardActivityRow({
        type: 'list.created',
        createdAt: 'not-a-date',
        userId: { displayName: 'Eve' },
        metadata: { entityName: 'Backlog' },
      }),
    ).toBeNull();
  });
});
