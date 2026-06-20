import { getMinIOClient } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';
import { parsePositiveInt } from '../../utils/parseEnvInt.js';
import { VIDEO_POSTER_PREVIEW } from '../../../shared/videoPosterPreviewPreset.js';
import { BUCKET_NAME } from './minioPaths.js';
import { mintAttachmentInternalReadUrl } from './urls.js';
import {
  extractVideoFrameFromPresignedUrl,
  ffmpegMjpegQualityFromPreset,
  isVideoContentType,
} from './videoPosterFrame.js';

const POSTER_PRESIGN_TTL_SEC = 120;

/** Sidecar JPEG poster beside the source object (e.g. `{cardId}/{id}.poster.jpg`). */
export function videoPosterCacheObjectKey(sourceObjectName: string): string {
  const trimmed = sourceObjectName.trim().replace(/\\/g, '/');
  const slash = trimmed.lastIndexOf('/');
  const dir = slash >= 0 ? trimmed.slice(0, slash) : '';
  const file = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const stem = file.replace(/\.[^./]+$/, '');
  const posterName = `${stem}.poster.jpg`;
  return dir.length > 0 ? `${dir}/${posterName}` : posterName;
}

async function readBufferFromMinio(objectKey: string): Promise<Buffer | null> {
  const client = getMinIOClient();
  try {
    const stream = await client.getObject(BUCKET_NAME, objectKey);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function readCachedVideoPosterBuffer(
  sourceObjectName: string,
): Promise<{ readonly buffer: Buffer; readonly contentType: 'image/jpeg' } | null> {
  const objectKey = videoPosterCacheObjectKey(sourceObjectName);
  const buffer = await readBufferFromMinio(objectKey);
  if (buffer == null || buffer.length === 0) {
    return null;
  }
  return { buffer, contentType: 'image/jpeg' };
}

async function writeCachedVideoPosterBuffer(sourceObjectName: string, buffer: Buffer): Promise<void> {
  const client = getMinIOClient();
  const objectKey = videoPosterCacheObjectKey(sourceObjectName);
  await client.putObject(BUCKET_NAME, objectKey, buffer, buffer.length, {
    'Content-Type': 'image/jpeg',
  });
}

export async function ensureVideoPosterCached(args: {
  readonly objectName: string;
  readonly contentType: string;
}): Promise<boolean> {
  if (!isVideoContentType(args.contentType)) {
    return false;
  }

  const existing = await readCachedVideoPosterBuffer(args.objectName);
  if (existing != null) {
    return true;
  }

  try {
    const presigned = await mintAttachmentInternalReadUrl(args.objectName, POSTER_PRESIGN_TTL_SEC);
    const jpegQuality = ffmpegMjpegQualityFromPreset(VIDEO_POSTER_PREVIEW.quality);
    const frame = await extractVideoFrameFromPresignedUrl(presigned.url, jpegQuality);
    if (frame == null) {
      return false;
    }

    await writeCachedVideoPosterBuffer(args.objectName, frame);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: message, objectName: args.objectName, event: 'attachment.video_poster.cache_failed' },
      'Failed to cache video poster',
    );
    return false;
  }
}

export async function removeVideoPosterCache(sourceObjectName: string): Promise<void> {
  const client = getMinIOClient();
  const objectKey = videoPosterCacheObjectKey(sourceObjectName);
  await client.removeObject(BUCKET_NAME, objectKey).catch(() => undefined);
}

interface VideoPosterCacheJob {
  readonly objectName: string;
  readonly contentType: string;
}

const queuedPosterKeys = new Set<string>();
const pendingPosterJobs: VideoPosterCacheJob[] = [];
let activePosterJobs = 0;

function parsePosterCacheConcurrency(): number {
  return parsePositiveInt(process.env.VIDEO_POSTER_CACHE_CONCURRENCY, 1);
}

function parsePosterCacheMaxQueue(): number {
  return parsePositiveInt(process.env.VIDEO_POSTER_CACHE_MAX_QUEUE, 500);
}

function dropOverflowPosterJobs(maxQueue: number): void {
  while (pendingPosterJobs.length >= maxQueue) {
    const dropped = pendingPosterJobs.shift();
    if (dropped == null) {
      break;
    }
    queuedPosterKeys.delete(dropped.objectName);
  }
}

function drainVideoPosterCacheQueue(): void {
  const maxConcurrent = parsePosterCacheConcurrency();
  while (activePosterJobs < maxConcurrent && pendingPosterJobs.length > 0) {
    const job = pendingPosterJobs.shift();
    if (job == null) {
      break;
    }
    activePosterJobs += 1;
    void ensureVideoPosterCached(job)
      .catch(() => undefined)
      .finally(() => {
        queuedPosterKeys.delete(job.objectName);
        activePosterJobs -= 1;
        drainVideoPosterCacheQueue();
      });
  }
}

/** ponytail: in-process queue; upgrade to shared worker if poster generation becomes a bottleneck. */
export function scheduleVideoPosterCache(params: {
  readonly objectName: string;
  readonly contentType: string;
}): void {
  if (queuedPosterKeys.has(params.objectName)) {
    return;
  }
  dropOverflowPosterJobs(parsePosterCacheMaxQueue());
  queuedPosterKeys.add(params.objectName);
  pendingPosterJobs.push(params);
  setImmediate(drainVideoPosterCacheQueue);
}

export function isVideoPosterCacheJobQueued(objectName: string): boolean {
  return queuedPosterKeys.has(objectName);
}

/** Test-only queue depth for bounded-queue assertions. */
export function getVideoPosterCacheQueueDepthForTests(): number {
  return pendingPosterJobs.length;
}

export function resetVideoPosterCacheQueueForTests(): void {
  queuedPosterKeys.clear();
  pendingPosterJobs.length = 0;
  activePosterJobs = 0;
}
