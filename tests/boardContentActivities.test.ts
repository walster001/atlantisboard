/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  BOARD_ACTIVITY_TRACKING_CATEGORIES,
  BOARD_ACTIVITY_TRACKING_CATEGORY_KEYS,
  BOARD_CONTENT_ACTIVITY_CATEGORY_BY_TYPE,
  BOARD_CONTENT_ACTIVITY_TYPES,
  BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
  DEFAULT_BOARD_ACTIVITY_TRACKING,
  boardActivityTrackingEnabled,
  isBoardContentActivityType,
} from '../src/shared/constants/boardContentActivities.js';

describe('board content activity constants', () => {
  it('maps every activity type to a tracking category', () => {
    for (const type of BOARD_CONTENT_ACTIVITY_TYPES) {
      expect(BOARD_CONTENT_ACTIVITY_CATEGORY_BY_TYPE[type]).toBeString();
      expect(BOARD_ACTIVITY_TRACKING_CATEGORY_KEYS).toContain(
        BOARD_CONTENT_ACTIVITY_CATEGORY_BY_TYPE[type],
      );
    }
  });

  it('recognizes board content types and rejects member audit types', () => {
    expect(isBoardContentActivityType('card.created')).toBe(true);
    expect(isBoardContentActivityType('board.member.add')).toBe(false);
  });

  it('defaults comments off and cards on when tracking is unset', () => {
    expect(boardActivityTrackingEnabled(undefined, 'cards')).toBe(true);
    expect(boardActivityTrackingEnabled(undefined, 'comments')).toBe(false);
    expect(DEFAULT_BOARD_ACTIVITY_TRACKING.comments).toBe(false);
    expect(DEFAULT_BOARD_ACTIVITY_TRACKING.cards).toBe(true);
  });

  it('honors explicit per-category overrides', () => {
    expect(boardActivityTrackingEnabled({ cards: false }, 'cards')).toBe(false);
    expect(boardActivityTrackingEnabled({ comments: true }, 'comments')).toBe(true);
  });

  it('exposes category labels for settings UI', () => {
    expect(BOARD_ACTIVITY_TRACKING_CATEGORIES.length).toBe(
      BOARD_ACTIVITY_TRACKING_CATEGORY_KEYS.length,
    );
    for (const category of BOARD_ACTIVITY_TRACKING_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
    }
  });

  it('uses a 30-day default retention constant', () => {
    expect(BOARD_CONTENT_DEFAULT_RETENTION_DAYS).toBe(30);
  });
});
