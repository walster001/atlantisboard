/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  deserializeResumeToken,
  serializeResumeToken,
} from '../../src/server/sockets/changeStreams/resumeTokenStore.js';

describe('change stream resume token store', () => {
  it('round-trips resume tokens via EJSON', () => {
    const token = { _data: new ObjectId().toHexString() };
    const serialized = serializeResumeToken(token);
    const restored = deserializeResumeToken(serialized);
    expect(restored).toEqual(token);
  });

  it('returns null for invalid serialized tokens', () => {
    expect(deserializeResumeToken('not-json')).toBeNull();
    expect(deserializeResumeToken('null')).toBeNull();
  });
});
