import { describe, expect, it } from 'bun:test';
import { Types } from 'mongoose';
import { extractMongoStringId } from '../src/shared/mongoId.js';

describe('extractMongoStringId', () => {
  it('stringifies mongoose ObjectId without stack overflow', () => {
    const id = new Types.ObjectId('6964f5c48913b29591330915');
    expect(extractMongoStringId(id)).toBe('6964f5c48913b29591330915');
  });

  it('reads EJSON $oid and populated user _id', () => {
    expect(extractMongoStringId({ $oid: '6a19879e1e085d8ef1acf781' })).toBe('6a19879e1e085d8ef1acf781');
    expect(extractMongoStringId({ _id: '6964f5c48913b29591330915', displayName: 'Test' })).toBe(
      '6964f5c48913b29591330915',
    );
  });
});
