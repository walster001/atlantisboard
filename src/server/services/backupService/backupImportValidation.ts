import { open } from 'node:fs/promises';
import unzipper from 'unzipper';
import { ValidationError } from '../../../shared/errors/domainErrors.js';
import { BACKUP_FORMAT, BACKUP_FORMAT_V1 } from './backupShared.js';

const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_ARCHIVE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

export function isZipMagicHeader(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  const head = buffer.subarray(0, 4);
  return head.equals(ZIP_LOCAL_HEADER) || head.equals(ZIP_EMPTY_ARCHIVE);
}

export function isAllowedBackupZipMimeType(mimeType: string): boolean {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    normalized === 'application/zip' ||
    normalized === 'application/x-zip-compressed' ||
    normalized === 'application/octet-stream'
  );
}

export function isAllowedBackupZipFileName(fileName: string): boolean {
  const trimmed = fileName.trim();
  return trimmed.length > 0 && trimmed.toLowerCase().endsWith('.zip');
}

export async function readZipMagicHeader(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function validateBackupZipArchive(
  filePath: string,
): Promise<{ format: typeof BACKUP_FORMAT | typeof BACKUP_FORMAT_V1 }> {
  const magic = await readZipMagicHeader(filePath);
  if (!isZipMagicHeader(magic)) {
    throw new ValidationError('File is not a valid ZIP archive');
  }

  let directory: Awaited<ReturnType<typeof unzipper.Open.file>>;
  try {
    directory = await unzipper.Open.file(filePath);
  } catch {
    throw new ValidationError('File is not a valid ZIP archive');
  }

  const manifestEntry = directory.files.find((entry) => entry.path === 'manifest.json');
  if (manifestEntry == null) {
    throw new ValidationError('Invalid backup archive: manifest.json is missing');
  }

  let manifestRaw: string;
  try {
    const manifestBuffer = await manifestEntry.buffer();
    manifestRaw = manifestBuffer.toString('utf8');
  } catch {
    throw new ValidationError('Invalid backup archive: manifest.json could not be read');
  }

  let parsed: { format?: string };
  try {
    parsed = JSON.parse(manifestRaw) as { format?: string };
  } catch {
    throw new ValidationError('Invalid backup archive: manifest.json is not valid JSON');
  }

  if (parsed.format !== BACKUP_FORMAT && parsed.format !== BACKUP_FORMAT_V1) {
    throw new ValidationError(`Unsupported backup format: ${String(parsed.format ?? 'unknown')}`);
  }

  return {
    format: parsed.format === BACKUP_FORMAT_V1 ? BACKUP_FORMAT_V1 : BACKUP_FORMAT,
  };
}
