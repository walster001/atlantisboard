import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_BOARD_TYPE,
  isBoardType,
  resolveCreateBoardPath,
  usesKanbanBoardLayout,
} from '../src/shared/constants/boardType.js';
import { createBoardSchema } from '../src/server/routes/boards/schemas.js';

describe('board type create dispatch', () => {
  test('defaults to normal; visual storytelling creates; step guide stays stub', () => {
    expect(DEFAULT_BOARD_TYPE).toBe('normal');
    expect(isBoardType('normal')).toBe(true);
    expect(isBoardType('visual-storytelling')).toBe(true);
    expect(isBoardType('step-guide')).toBe(true);
    expect(isBoardType('kanban')).toBe(false);
    expect(resolveCreateBoardPath('normal')).toBe('normal');
    expect(resolveCreateBoardPath('visual-storytelling')).toBe('visual-storytelling');
    expect(resolveCreateBoardPath('step-guide')).toBe('step-guide-stub');
  });

  test('storyboard uses non-kanban layout; missing type is kanban', () => {
    expect(usesKanbanBoardLayout('visual-storytelling')).toBe(false);
    expect(usesKanbanBoardLayout('normal')).toBe(true);
    expect(usesKanbanBoardLayout('step-guide')).toBe(true);
    expect(usesKanbanBoardLayout(undefined)).toBe(true);
  });

  test('create board schema accepts visual-storytelling and still lists step-guide', () => {
    const story = createBoardSchema.parse({
      workspaceId: '507f1f77bcf86cd799439011',
      name: 'Story',
      boardType: 'visual-storytelling',
    });
    expect(story.boardType).toBe('visual-storytelling');
    const stub = createBoardSchema.parse({
      workspaceId: '507f1f77bcf86cd799439011',
      name: 'Guide',
      boardType: 'step-guide',
    });
    expect(stub.boardType).toBe('step-guide');
    expect(() =>
      createBoardSchema.parse({
        workspaceId: '507f1f77bcf86cd799439011',
        name: 'Nope',
        boardType: 'kanban',
      }),
    ).toThrow();
  });
});
