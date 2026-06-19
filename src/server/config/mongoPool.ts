import { parsePositiveInt } from '../utils/parseEnvInt.js';

export type MongoPoolConfig = {
  readonly maxPoolSize: number;
  readonly minPoolSize: number;
};

const DEFAULT_MAX_POOL_SIZE = 20;
const DEFAULT_MIN_POOL_SIZE = 2;

/** Resolve Mongoose pool sizes from env; ensures min ≤ max. */
export function resolveMongoPoolConfig(env: NodeJS.ProcessEnv = process.env): MongoPoolConfig {
  let maxPoolSize = parsePositiveInt(env.MONGODB_MAX_POOL_SIZE, DEFAULT_MAX_POOL_SIZE);
  let minPoolSize = parsePositiveInt(env.MONGODB_MIN_POOL_SIZE, DEFAULT_MIN_POOL_SIZE);
  if (minPoolSize > maxPoolSize) {
    minPoolSize = maxPoolSize;
  }
  return { maxPoolSize, minPoolSize };
}
