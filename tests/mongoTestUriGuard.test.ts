import { describe, it, expect, afterEach } from 'bun:test';
import {
  assertSafeTestMongoUriForDestructiveOps,
  normalizeMongoDatabaseTarget,
  testMongoUriTargetsDevDatabase,
} from './helpers/integrationEnv.js';

describe('mongo test URI guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('normalizes host, port, and database from mongodb URI', () => {
    expect(
      normalizeMongoDatabaseTarget('mongodb://localhost:27017/kanboard?replicaSet=rs0'),
    ).toBe('localhost:27017/kanboard');
    expect(normalizeMongoDatabaseTarget('mongodb://127.0.0.1:27017/kanboard_test')).toBe(
      '127.0.0.1:27017/kanboard_test',
    );
  });

  it('detects when test and dev URIs target the same database', () => {
    expect(
      testMongoUriTargetsDevDatabase(
        'mongodb://localhost:27017/kanboard?replicaSet=rs0',
        'mongodb://localhost:27017/kanboard',
      ),
    ).toBe(true);
    expect(
      testMongoUriTargetsDevDatabase(
        'mongodb://localhost:27017/kanboard_test?replicaSet=rs0',
        'mongodb://localhost:27017/kanboard?replicaSet=rs0',
      ),
    ).toBe(false);
  });

  it('throws locally when MONGODB_TEST_URI is unset', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.MONGODB_TEST_URI;
    process.env.MONGODB_URI = 'mongodb://localhost:27017/kanboard?replicaSet=rs0';
    expect(() => assertSafeTestMongoUriForDestructiveOps()).toThrow(/MONGODB_TEST_URI is not set/);
  });

  it('throws locally when test URI targets kanboard by name', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.MONGODB_URI = 'mongodb://localhost:27017/kanboard?replicaSet=rs0';
    process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/kanboard?replicaSet=rs0';
    expect(() => assertSafeTestMongoUriForDestructiveOps()).toThrow(/Refusing to clear MongoDB/);
  });

  it('allows distinct test database locally', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.MONGODB_URI = 'mongodb://localhost:27017/kanboard?replicaSet=rs0';
    process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/kanboard_test?replicaSet=rs0';
    expect(() => assertSafeTestMongoUriForDestructiveOps()).not.toThrow();
  });

  it('allows same database in CI (ephemeral runner)', () => {
    process.env.CI = 'true';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/kanboard?replicaSet=rs0';
    process.env.MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/kanboard?replicaSet=rs0';
    expect(() => assertSafeTestMongoUriForDestructiveOps()).not.toThrow();
  });
});
