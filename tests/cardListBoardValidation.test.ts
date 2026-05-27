/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  assertListOnBoard,
  isListOnBoard,
} from '../src/server/services/cardService/listBoardValidation.js';

describe('cardListBoardValidation', () => {
  it('matches list board id to expected board id', () => {
    expect(isListOnBoard('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011')).toBe(true);
    expect(
      isListOnBoard({ toString: () => '507f1f77bcf86cd799439011' }, '507f1f77bcf86cd799439011'),
    ).toBe(true);
  });

  it('rejects mismatched or empty board ids', () => {
    expect(isListOnBoard('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012')).toBe(false);
    expect(isListOnBoard('507f1f77bcf86cd799439011', '')).toBe(false);
    expect(isListOnBoard(null, '507f1f77bcf86cd799439011')).toBe(false);
  });

  it('assertListOnBoard throws List not found on mismatch', () => {
    expect(() => assertListOnBoard('a', 'b')).toThrow('List not found');
  });
});
