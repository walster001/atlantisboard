/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { buildUserDirectoryRegexFilter } from '../src/server/services/userDirectoryService.js';

describe('user directory search', () => {
  it('matches partial substrings case-insensitively in email', () => {
    const re = buildUserDirectoryRegexFilter('atlantis');
    expect(re.test('atlantisbaseimage@example.com')).toBe(true);
    expect(re.test('user@ATLANTISBOARD.org')).toBe(true);
  });

  it('matches display name and username fragments', () => {
    const re = buildUserDirectoryRegexFilter('Base');
    expect(re.test('Atlantis Base Image')).toBe(true);
    expect(re.test('atlantis_base_image')).toBe(true);
  });

  it('escapes regex metacharacters in the query', () => {
    const re = buildUserDirectoryRegexFilter('user+test@');
    expect(re.test('user+test@domain.com')).toBe(true);
    expect(re.test('userXtest@domain.com')).toBe(false);
  });
});
