import { describe, expect, test } from 'bun:test';
import {
  escapeRegexMetacharacters,
  sanitizeActivitySearchInput,
  MAX_ACTIVITY_SEARCH_LENGTH,
} from '../src/shared/utils/escapeRegex.js';

describe('sanitizeActivitySearchInput', () => {
  test('escapes regex metacharacters', () => {
    expect(sanitizeActivitySearchInput('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
  });

  test('caps length at 100 characters', () => {
    const long = 'a'.repeat(MAX_ACTIVITY_SEARCH_LENGTH + 50);
    expect(sanitizeActivitySearchInput(long)?.length).toBe(MAX_ACTIVITY_SEARCH_LENGTH);
  });

  test('returns undefined for blank input', () => {
    expect(sanitizeActivitySearchInput('   ')).toBeUndefined();
  });
});

describe('escapeRegexMetacharacters', () => {
  test('escapes dots and brackets', () => {
    expect(escapeRegexMetacharacters('foo.bar[baz]')).toBe('foo\\.bar\\[baz\\]');
  });
});
