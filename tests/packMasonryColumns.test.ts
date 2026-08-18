import { describe, expect, test } from 'bun:test';
import { packMasonryColumns } from '../src/client/components/board/visualStorytelling/packMasonryColumns.js';

describe('packMasonryColumns', () => {
  test('first three equal-height cards go LTR, fourth under the left column', () => {
    const packed = packMasonryColumns(
      [
        { id: '1', height: 10 },
        { id: '2', height: 10 },
        { id: '3', height: 10 },
        { id: '4', height: 10 },
      ],
      3,
    );
    expect(packed).toEqual([['1', '4'], ['2'], ['3']]);
  });

  test('after LTR first row, next card goes under the shortest column', () => {
    const packed = packMasonryColumns(
      [
        { id: 'a', height: 30 },
        { id: 'b', height: 10 },
        { id: 'c', height: 20 },
        { id: 'd', height: 8 },
      ],
      3,
    );
    expect(packed).toEqual([['a'], ['b', 'd'], ['c']]);
  });

  test('tied shortest columns pick the leftmost', () => {
    const packed = packMasonryColumns(
      [
        { id: '1', height: 12 },
        { id: '2', height: 5 },
        { id: '3', height: 5 },
        { id: '4', height: 4 },
      ],
      3,
    );
    expect(packed).toEqual([['1'], ['2', '4'], ['3']]);
  });
});
