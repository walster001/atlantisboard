#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { MINIO_BUCKET_BACKUPS, MINIO_BUCKET_NAMES } from '../src/shared/constants/minioBuckets.js';
import { connectDatabase, disconnectDatabase } from '../src/server/config/database.js';
import { getMinIOClient } from '../src/server/config/minio.js';
import { restoreMongoFromDir } from '../src/server/services/backupService/mongoArchive.js';
import { buildPutObjectMetadata, type MinioObjectMetadataMap } from '../src/server/services/backupService/minioIo.js';

interface ParsedBackupManifest {
  readonly format: string;
  readonly mongoCollections: readonly string[];
  readonly minioMetadataFile?: string;
}

async function readManifest(extractRoot: string): Promise<ParsedBackupManifest> {
  const raw = await readFile(join(extractRoot, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    format?: unknown;
    mongoCollections?: unknown;
    minioMetadataFile?: unknown;
  };
  if (typeof parsed.format !== 'string' || parsed.format.trim() === '') {
    throw new Error('Invalid manifest: format');
  }
  if (!Array.isArray(parsed.mongoCollections) || !parsed.mongoCollections.every((v) => typeof v === 'string')) {
    throw new Error('Invalid manifest: mongoCollections');
  }
  return {
    format: parsed.format,
    mongoCollections: parsed.mongoCollections,
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
      return allowed.has(bucket) && bucket !== MINIO_BUCKET_BACKUPS;
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
    await restoreMongoFromDir(extractRoot, manifest as unknown as { mongoCollections: string[] });
  } finally {
    await disconnectDatabase();
  }

  console.log('📦 Restoring MinIO objects…');
  await restoreMinioFromDir(extractRoot, minioMeta);

  console.log('✅ Restore complete.');
}

await main();

