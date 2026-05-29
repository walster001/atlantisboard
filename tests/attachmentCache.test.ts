import { describe, it, expect } from 'bun:test';
import { attachmentLocationCacheKey } from '../src/server/services/attachmentCache.js';

describe('attachmentCache', () => {
  it('uses stable location cache keys', () => {
    expect(attachmentLocationCacheKey('abc-123')).toBe('attach:loc:abc-123');
  });
});
