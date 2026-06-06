/**
 * One-shot: removes legacy single-field indexes on `activities` (boardId, cardId, userId, type)
 * that were dropped from the Mongoose schema in favour of compound indexes only.
 *
 * Usage (from repo root): `bun run scripts/drop-activity-legacy-indexes.ts`
 * Requires MONGODB_URI (defaults to mongodb://localhost:27017/kanboard).
 */
import mongoose from 'mongoose';
import { Activity } from '../src/server/models/Activity.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/kanboard';

const LEGACY_SINGLE_FIELDS = new Set(['boardId', 'cardId', 'userId', 'type']);

function isLegacySingleFieldIndex(key: Record<string, unknown>): boolean {
  const names = Object.keys(key);
  if (names.length !== 1) {
    return false;
  }
  return LEGACY_SINGLE_FIELDS.has(names[0]);
}

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  try {
    const coll = Activity.collection;
    const indexes = await coll.indexes();

    for (const idx of indexes) {
      const name = idx.name;
      if (name === undefined || name === '_id_') {
        continue;
      }
      const key = idx.key as Record<string, unknown>;
      if (!isLegacySingleFieldIndex(key)) {
        continue;
      }
      await coll.dropIndex(name);
      console.log(`Dropped index "${name}"`, key);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
