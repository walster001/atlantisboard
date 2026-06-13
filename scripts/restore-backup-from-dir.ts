#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { MINIO_BUCKET_NAMES } from '../src/shared/constants/minioBuckets.js';
import { connectDatabase, disconnectDatabase } from '../src/server/config/database.js';
import { getMinIOClient } from '../src/server/config/minio.js';
import { restoreMongoFromDir } from '../src/server/services/backupService/mongoArchive.js';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_V1,
  type ParsedBackupManifest,
} from '../src/server/services/backupService/backupShared.js';
import { buildPutObjectMetadata, type MinioObjectMetadataMap } from '../src/server/services/backupService/minioIo.js';

async function readManifest(extractRoot: string): Promise<ParsedBackupManifest> {
  const raw = await readFile(join(extractRoot, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    format?: string;
    mongoCollections?: string[];
    minioArchiveMethod?: string;
    minioMetadataFile?: string;
  };
  if (parsed.format !== BACKUP_FORMAT && parsed.format !== BACKUP_FORMAT_V1) {
    throw new Error(`Unsupported backup format: ${String(parsed.format)}`);
  }
  if (!Array.isArray(parsed.mongoCollections)) {
    throw new Error('Invalid manifest: mongoCollections');
  }
  const fmt = parsed.format === BACKUP_FORMAT_V1 ? BACKUP_FORMAT_V1 : BACKUP_FORMAT;
  const minioArchiveMethod =
    fmt === BACKUP_FORMAT_V1
      ? 'sdk-stream-v1'
      : parsed.minioArchiveMethod === 'mc-mirror-v1'
        ? 'mc-mirror-v1'
        : 'mc-mirror-v1';
  return {
    format: fmt,
    mongoCollections: parsed.mongoCollections,
    minioArchiveMethod,
    ...(typeof parsed.minioMetadataFile === 'string' && parsed.minioMetadataFile.trim() !== ''
      ? { minioMetadataFile: parsed.minioMetadataFile.trim() }
      : {}),
  };
}

async function readMinioObjectMetadataMap(
  extractRoot: string,
  manifest: ParsedBackupManifest,
): Promise<MinioObjectMetadataMap> {
  const fileName = manifest.minioMetadataFile ?? 'minio-metadata.json';
  const filePath = join(extractRoot, fileName);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as MinioObjectMetadataMap;
  } catch {
    return {};
  }
}

async function walkRelativeFiles(dir: string, baseRel: string): Promise<string[]> {
  const out: string[] = [];
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    const rel = baseRel === '' ? ent.name : `${baseRel}/${ent.name}`;
    if (ent.isDirectory()) {
      out.push(...(await walkRelativeFiles(p, rel)));
    } else if (ent.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function restoreMinioFromDir(extractRoot: string, minioObjectMetadata: MinioObjectMetadataMap): Promise<void> {
  const root = join(extractRoot, 'minio');
  const client = getMinIOClient();
  const allowed = new Set<string>([...MINIO_BUCKET_NAMES]);
  const rels = await walkRelativeFiles(root, '');
  const objects = rels
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((norm) => {
      const slash = norm.indexOf('/');
      if (slash < 1) {
        return false;
      }
      const bucket = norm.slice(0, slash);
      return allowed.has(bucket);
    });

  for (const norm of objects) {
    const slash = norm.indexOf('/');
    const bucket = norm.slice(0, slash);
    const objectKey = norm.slice(slash + 1);
    const filePath = join(root, norm);
    const putMetadata = buildPutObjectMetadata(minioObjectMetadata[bucket]?.[objectKey]);
    await client.fPutObject(bucket, objectKey, filePath, putMetadata);
  }
}

async function main(): Promise<void> {
  const extractRoot = process.argv[2];
  if (!extractRoot || extractRoot.trim() === '') {
    console.error('Usage: bun run scripts/restore-backup-from-dir.ts <extractRoot>');
    process.exit(2);
  }

  const manifest = await readManifest(extractRoot);
  const minioMeta = await readMinioObjectMetadataMap(extractRoot, manifest);

  console.log('🔌 Connecting MongoDB…');
  await connectDatabase();
  try {
    console.log('🗄️  Restoring Mongo collections…');
    await restoreMongoFromDir(extractRoot, manifest);
  } finally {
    await disconnectDatabase();
  }

  console.log('📦 Restoring MinIO objects…');
  await restoreMinioFromDir(extractRoot, minioMeta);

  console.log('✅ Restore complete.');
}

await main();

