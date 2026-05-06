import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { BSON, EJSON } from 'bson';
import type { Document } from 'mongodb';
import mongoose from 'mongoose';
import {
  MONGO_BACKUP_EXCLUDE,
  sortCollectionsForRestore,
  type ParsedBackupManifest,
} from './backupShared.js';
import {
  getMongoCursorBatchSize,
  getMongoExportConcurrency,
  getMongoInsertBatchSize,
  runWithConcurrency,
} from './runtime.js';

/**
 * Exports each collection as a mongodump-style BSON stream: repeated
 * `[int32 little-endian total length including the 4 prefix bytes][bson payload]`.
 * Uses a single cursor per collection (natural order, no `$skip` pagination).
 */
export async function dumpMongoCollectionsToBsonDir(params: {
  readonly mongoDir: string;
  readonly onCollectionDumped?: (
    completed: number,
    total: number,
    collectionName: string,
  ) => Promise<void> | void;
}): Promise<readonly string[]> {
  const { mongoDir, onCollectionDumped } = params;
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const cols = await db.listCollections().toArray();
  const names = cols
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !MONGO_BACKUP_EXCLUDE.has(n))
    .sort((a, b) => a.localeCompare(b));

  const cursorBatchSize = getMongoCursorBatchSize();
  const writeCollectionToBson = async (collectionName: string): Promise<void> => {
    const outPath = join(mongoDir, `${collectionName}.bson`);
    const writeStream = createWriteStream(outPath);
    const cursor = db.collection(collectionName).find<Document>({}, { batchSize: cursorBatchSize });
    for await (const doc of cursor) {
      const bsonBuffer = BSON.serialize(doc);
      const totalSize = 4 + bsonBuffer.length;
      const header = Buffer.allocUnsafe(4);
      header.writeInt32LE(totalSize, 0);
      if (!writeStream.write(header)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
      if (!writeStream.write(bsonBuffer)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
    }
    writeStream.end();
    await finished(writeStream);
  };
  const width = getMongoExportConcurrency();
  const doneRef = { value: 0 };
  await runWithConcurrency(names, width, async (collectionName) => {
    await writeCollectionToBson(collectionName);
    doneRef.value += 1;
    if (onCollectionDumped != null) {
      await onCollectionDumped(doneRef.value, names.length, collectionName);
    }
  });
  return names;
}

async function* iterateBsonDocumentsFromFile(filePath: string): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(filePath);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, Buffer.from(chunk)]);
    while (buf.length >= 4) {
      const len = buf.readInt32LE(0);
      if (len < 5) {
        throw new Error(`Invalid BSON frame length ${String(len)} in ${filePath}`);
      }
      if (buf.length < len) {
        break;
      }
      const docBytes = buf.subarray(4, len);
      buf = buf.subarray(len);
      yield BSON.deserialize(docBytes) as Record<string, unknown>;
    }
  }
  if (buf.length > 0) {
    throw new Error(`Incomplete BSON tail in ${filePath}`);
  }
}

export async function restoreMongoFromDir(
  extractRoot: string,
  manifest: ParsedBackupManifest,
  onCollectionRestored?: (completed: number, total: number, collectionName: string) => Promise<void> | void,
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const mongoDir = join(extractRoot, 'mongo');
  let discovered: string[];
  try {
    const entries = await readdir(mongoDir);
    const fromBson = entries.filter((f) => f.endsWith('.bson')).map((f) => f.replace(/\.bson$/, ''));
    const fromNdjson = entries.filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));
    discovered = [...new Set([...fromBson, ...fromNdjson])];
  } catch {
    throw new Error('Backup archive is missing mongo/ dump');
  }
  const merged = [...new Set([...manifest.mongoCollections, ...discovered])];
  const ordered = sortCollectionsForRestore(merged);
  let restoredCollections = 0;

  for (const collectionName of ordered) {
    const coll = db.collection(collectionName);
    const bsonPath = join(mongoDir, `${collectionName}.bson`);
    const ndjsonPath = join(mongoDir, `${collectionName}.ndjson`);
    let hasBson = false;
    try {
      const st = await stat(bsonPath);
      hasBson = st.isFile();
    } catch {
      hasBson = false;
    }
    if (hasBson) {
      await coll.deleteMany({});
      const batch: Record<string, unknown>[] = [];
      const batchSize = getMongoInsertBatchSize();
      for await (const doc of iterateBsonDocumentsFromFile(bsonPath)) {
        batch.push(doc);
        if (batch.length >= batchSize) {
          await coll.insertMany(batch, { ordered: false });
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        await coll.insertMany(batch, { ordered: false });
      }
      restoredCollections += 1;
      if (onCollectionRestored != null) {
        await onCollectionRestored(restoredCollections, ordered.length, collectionName);
      }
      continue;
    }
    let text: string;
    try {
      text = await readFile(ndjsonPath, 'utf8');
    } catch {
      continue;
    }
    await coll.deleteMany({});
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const chunk = getMongoInsertBatchSize();
    for (let i = 0; i < lines.length; i += chunk) {
      const slice = lines.slice(i, i + chunk);
      const docs = slice.map((line) => EJSON.parse(line) as Record<string, unknown>);
      if (docs.length > 0) {
        await coll.insertMany(docs, { ordered: false });
      }
    }
    restoredCollections += 1;
    if (onCollectionRestored != null) {
      await onCollectionRestored(restoredCollections, ordered.length, collectionName);
    }
  }
}
