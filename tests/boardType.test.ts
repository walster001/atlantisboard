import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_BOARD_TYPE,
  isBoardType,
  resolveCreateBoardPath,
} from '../src/shared/constants/boardType.js';

describe('board type create dispatch', () => {
  test('defaults to normal and routes visual storytelling to the stub', () => {
    expect(DEFAULT_BOARD_TYPE).toBe('normal');
    expect(isBoardType('normal')).toBe(true);
    expect(isBoardType('visual-storytelling')).toBe(true);
    expect(isBoardType('step-guide')).toBe(true);
    expect(isBoardType('kanban')).toBe(false);
    expect(resolveCreateBoardPath('normal')).toBe('normal');
    expect(resolveCreateBoardPath('visual-storytelling')).toBe('visual-storytelling-stub');
    expect(resolveCreateBoardPath('step-guide')).toBe('step-guide-stub');
  });
});
