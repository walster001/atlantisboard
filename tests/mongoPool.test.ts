import { afterEach, describe, expect, it } from 'bun:test';
import { resolveMongoPoolConfig } from '../src/server/config/mongoPool.js';

describe('resolveMongoPoolConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses defaults when env is unset', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(resolveMongoPoolConfig(env)).toEqual({ maxPoolSize: 20, minPoolSize: 2 });
  });

  it('reads positive integer pool sizes from env', () => {
    const env: NodeJS.ProcessEnv = {
      MONGODB_MAX_POOL_SIZE: '40',
      MONGODB_MIN_POOL_SIZE: '5',
    };
    expect(resolveMongoPoolConfig(env)).toEqual({ maxPoolSize: 40, minPoolSize: 5 });
  });

  it('falls back on invalid values', () => {
    const env: NodeJS.ProcessEnv = {
      MONGODB_MAX_POOL_SIZE: 'abc',
      MONGODB_MIN_POOL_SIZE: '0',
    };
    expect(resolveMongoPoolConfig(env)).toEqual({ maxPoolSize: 20, minPoolSize: 2 });
  });

  it('clamps min to max when min exceeds max', () => {
    const env: NodeJS.ProcessEnv = {
      MONGODB_MAX_POOL_SIZE: '10',
      MONGODB_MIN_POOL_SIZE: '25',
    };
    expect(resolveMongoPoolConfig(env)).toEqual({ maxPoolSize: 10, minPoolSize: 10 });
  });
});
