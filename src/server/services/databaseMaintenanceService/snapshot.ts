import mongoose from 'mongoose';
import type {
  AdminDatabaseMaintenanceSnapshot,
  DatabaseCleanupCategorySnapshot,
  DatabaseCollectionStat,
} from '../../../shared/types/adminDatabaseMaintenance.js';
import { logger } from '../../utils/logger.js';
import { applicationMongoCollectionMeta } from '../../../shared/constants/applicationMongoCollections.js';
import { CATEGORY_DEFINITIONS } from './categories.js';
import { KNOWN_COLLECTIONS } from './typesAndHelpers.js';

async function readMongoStats(): Promise<{
  databaseName: string;
  mongoVersion: string | null;
  dataSizeMb: number | null;
  storageSizeMb: number | null;
}> {
  const db = mongoose.connection.db;
  if (db == null) {
    return {
      databaseName: '',
      mongoVersion: null,
      dataSizeMb: null,
      storageSizeMb: null,
    };
  }
  let mongoVersion: string | null = null;
  try {
    const buildInfo = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
    mongoVersion = typeof buildInfo.version === 'string' ? buildInfo.version : null;
  } catch (error) {
    logger.warn({ error }, 'Could not read MongoDB version for database maintenance');
  }
  let dataSizeMb: number | null = null;
  let storageSizeMb: number | null = null;
  try {
    const stats = (await db.stats()) as { dataSize?: number; storageSize?: number };
    if (typeof stats.dataSize === 'number' && Number.isFinite(stats.dataSize)) {
      dataSizeMb = stats.dataSize / (1024 * 1024);
    }
    if (typeof stats.storageSize === 'number' && Number.isFinite(stats.storageSize)) {
      storageSizeMb = stats.storageSize / (1024 * 1024);
    }
  } catch (error) {
    logger.warn({ error }, 'Could not read MongoDB db.stats for database maintenance');
  }
  return {
    databaseName: db.databaseName,
    mongoVersion,
    dataSizeMb,
    storageSizeMb,
  };
}

async function readCollectionStats(): Promise<readonly DatabaseCollectionStat[]> {
  const db = mongoose.connection.db;
  if (db == null) {
    return [];
  }
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const stats: DatabaseCollectionStat[] = [];
  for (const coll of collections) {
    const name = coll.name;
    if (name.startsWith('system.')) {
      continue;
    }
    try {
      const count = await db.collection(name).countDocuments();
      const knownToApp = KNOWN_COLLECTIONS.has(name);
      const meta = knownToApp ? applicationMongoCollectionMeta(name) : undefined;
      stats.push({
        name,
        documentCount: count,
        knownToApp,
        ...(meta != null ? { label: meta.label, description: meta.description } : {}),
      });
    } catch (error) {
      logger.warn({ error, collection: name }, 'Could not count collection documents');
    }
  }
  return stats.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDatabaseMaintenanceSnapshot(): Promise<AdminDatabaseMaintenanceSnapshot> {
  const [mongoStats, collections, categoryCounts] = await Promise.all([
    readMongoStats(),
    readCollectionStats(),
    Promise.all(
      CATEGORY_DEFINITIONS.map(async (def) => ({
        def,
        count: await def.count(),
      })),
    ),
  ]);

  const cleanupCategories: DatabaseCleanupCategorySnapshot[] = categoryCounts.map(({ def, count }) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    count,
    safeToDelete: def.safeToDelete,
  }));

  const totalDocuments = collections.reduce((sum, row) => sum + row.documentCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    databaseName: mongoStats.databaseName,
    mongoVersion: mongoStats.mongoVersion,
    dataSizeMb: mongoStats.dataSizeMb,
    storageSizeMb: mongoStats.storageSizeMb,
    totalDocuments,
    collections,
    cleanupCategories,
  };
}
