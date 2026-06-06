import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/**
 * Legacy MongoDB collections from an unshipped board/card templates feature.
 * No models, routes, or client code reference these — safe to drop on deploy.
 */
export const LEGACY_UNUSED_MONGO_COLLECTIONS = ['boardtemplates', 'cardtemplates'] as const;

export type LegacyUnusedMongoCollection = (typeof LEGACY_UNUSED_MONGO_COLLECTIONS)[number];

/** Drop legacy collections if they still exist. Returns how many collections were dropped. */
export async function dropLegacyUnusedCollections(): Promise<number> {
  const db = mongoose.connection.db;
  if (db == null) {
    return 0;
  }

  let dropped = 0;
  for (const name of LEGACY_UNUSED_MONGO_COLLECTIONS) {
    try {
      const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
      if (!exists) {
        continue;
      }
      const documentCount = await db.collection(name).countDocuments();
      await db.collection(name).drop();
      dropped += 1;
      logger.info({ collection: name, documentCount }, 'Dropped legacy unused MongoDB collection');
    } catch (error) {
      logger.warn({ error, collection: name }, 'Could not drop legacy unused MongoDB collection');
    }
  }
  return dropped;
}
