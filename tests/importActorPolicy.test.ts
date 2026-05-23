import { describe, expect, test } from 'bun:test';
import {
  importActorIdAllowedForPolicy,
  importActorIdEligibleAsBoardMember,
} from '../src/shared/import/importActorPolicy.js';

describe('importActorPolicy', () => {
  test('board placeholders are never board members', () => {
    expect(importActorIdEligibleAsBoardMember('board_placeholder')).toBe(false);
    expect(importActorIdEligibleAsBoardMember('legacy_placeholder_user')).toBe(false);
    expect(importActorIdEligibleAsBoardMember('registered')).toBe(true);
  });

  test('placeholders are only usable on cards when policy creates them', () => {
    expect(importActorIdAllowedForPolicy('board_placeholder', 'create_placeholders')).toBe(true);
    expect(importActorIdAllowedForPolicy('board_placeholder', 'discard_unmapped')).toBe(false);
    expect(importActorIdAllowedForPolicy('legacy_placeholder_user', 'discard_unmapped')).toBe(false);
    expect(importActorIdAllowedForPolicy('registered', 'discard_unmapped')).toBe(true);
  });
});
