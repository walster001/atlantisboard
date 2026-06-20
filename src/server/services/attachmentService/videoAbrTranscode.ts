import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMinIOClient } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';
import { BUCKET_NAME } from './minioPaths.js';
import { mintAttachmentInternalReadUrl } from './urls.js';
import { probeVideoSourceHeight } from './videoProbe.js';
import {
  selectVideoAbrRenditionHeights,
  videoAbrDashManifestObjectKey,
  videoAbrHlsMasterObjectKey,
  videoAbrStoragePrefix,
} from './videoAbrPaths.js';
import {
  buildVideoAbrManifestUrls,
  videoAbrObjectContentType,
  type VideoAbrStreamingMeta,
} from '../../../shared/videoStreaming.js';
import type { VideoRenditionHeight } from '../../../shared/videoQuality.js';

const TRANSCODE_PRESIGN_TTL_SEC = 3600;
const HLS_SEGMENT_SECONDS = 4;

interface RenditionSpec {
  readonly height: VideoRenditionHeight;
  readonly videoBitrate: string;
  readonly maxrate: string;
  readonly bufsize: string;
  readonly audioBitrate: string;
}

const RENDITION_SPECS: readonly RenditionSpec[] = [
  { height: 1080, videoBitrate: '5000k', maxrate: '5350k', bufsize: '7500k', audioBitrate: '128k' },
  { height: 720, videoBitrate: '2800k', maxrate: '2996k', bufsize: '4200k', audioBitrate: '128k' },
  { height: 480, videoBitrate: '1400k', maxrate: '1498k', bufsize: '2100k', audioBitrate: '96k' },
  { height: 360, videoBitrate: '800k', maxrate: '856k', bufsize: '1200k', audioBitrate: '96k' },
];

function isNotFoundMinioError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === 'NotFound' || code === 'NoSuchKey';
}

async function objectExists(objectKey: string): Promise<boolean> {
  const client = getMinIOClient();
  try {
    await client.statObject(BUCKET_NAME, objectKey);
    return true;
  } catch (error: unknown) {
    if (isNotFoundMinioError(error)) {
      return false;
    }
    throw error;
  }
}

export async function isVideoAbrPackagingReady(sourceObjectName: string): Promise<boolean> {
  const hls = await objectExists(videoAbrHlsMasterObjectKey(sourceObjectName));
  const dash = await objectExists(videoAbrDashManifestObjectKey(sourceObjectName));
  return hls && dash;
}

async function listPackagedRenditionHeights(sourceObjectName: string): Promise<readonly VideoRenditionHeight[]> {
  const client = getMinIOClient();
  const prefix = `${videoAbrStoragePrefix(sourceObjectName)}/hls/`;
  const heights: VideoRenditionHeight[] = [];
  const stream = client.listObjectsV2(BUCKET_NAME, prefix, true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      const match = /\/hls\/(\d+)p\/index\.m3u8$/i.exec(obj.name ?? '');
      if (match != null) {
        const parsed = Number.parseInt(match[1] ?? '', 10);
        if (parsed === 1080 || parsed === 720 || parsed === 480 || parsed === 360) {
          heights.push(parsed);
        }
      }
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return [...new Set(heights)].sort((a, b) => b - a);
}

export async function buildVideoAbrStreamingMeta(args: {
  readonly attachmentId: string;
  readonly sourceObjectName: string;
  readonly sourceHeight: number | null;
}): Promise<VideoAbrStreamingMeta> {
  const ready = await isVideoAbrPackagingReady(args.sourceObjectName);
  const urls = buildVideoAbrManifestUrls(args.attachmentId);
  const renditionHeights = ready
    ? await listPackagedRenditionHeights(args.sourceObjectName)
    : selectVideoAbrRenditionHeights(args.sourceHeight);
  return {
    ready,
    hlsManifestUrl: ready ? urls.hlsManifestUrl : null,
    dashManifestUrl: ready ? urls.dashManifestUrl : null,
    renditionHeights,
  };
}

async function uploadOutputTree(localRoot: string, storagePrefix: string): Promise<void> {
  const client = getMinIOClient();

  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = join(currentDir, entry.name);
      const relativePath = relativeDir.length > 0 ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(localPath, relativePath);
        continue;
      }
      const objectKey = `${storagePrefix}/${relativePath}`.replace(/\\/g, '/');
      const fileStat = await stat(localPath);
      const stream = createReadStream(localPath);
      await client.putObject(BUCKET_NAME, objectKey, stream, fileStat.size, {
        'Content-Type': videoAbrObjectContentType(relativePath),
      });
    }
  }

  await walk(localRoot, '');
}

function buildFilterComplex(renditions: readonly RenditionSpec[]): string {
  const count = renditions.length;
  const splitLabels = Array.from({ length: count }, (_, index) => `[v${index}]`).join('');
  const scales = renditions
    .map(
      (spec, index) =>
        `[v${index}]scale=-2:${spec.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v${index}out]`,
    )
    .join(';');
  return `[0:v]split=${count}${splitLabels};${scales}`;
}

function runFfmpegHlsPackaging(
  inputUrl: string,
  outputDir: string,
  renditions: readonly RenditionSpec[],
): Promise<boolean> {
  if (renditions.length === 0) {
    return Promise.resolve(false);
  }

  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputUrl,
    '-filter_complex',
    buildFilterComplex(renditions),
  ];

  renditions.forEach((_spec, index) => {
    const spec = renditions[index];
    if (spec == null) {
      return;
    }
    args.push(
      '-map',
      `[v${index}out]`,
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      spec.videoBitrate,
      '-maxrate',
      spec.maxrate,
      '-bufsize',
      spec.bufsize,
      '-c:a',
      'aac',
      '-b:a',
      spec.audioBitrate,
      '-ac',
      '2',
    );
  });

  const varStreamMap = renditions.map((_, index) => `v:${index},a:${index}`).join(' ');
  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(HLS_SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    varStreamMap,
    '-hls_segment_filename',
    join(outputDir, 'hls', '%v', 'seg_%03d.ts').replace(/\\/g, '/'),
    join(outputDir, 'hls', '%v', 'index.m3u8').replace(/\\/g, '/'),
  );

  return runFfmpegCommand(args);
}

function runFfmpegDashRemux(outputDir: string): Promise<boolean> {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    join(outputDir, 'hls', 'master.m3u8').replace(/\\/g, '/'),
    '-c',
    'copy',
    '-f',
    'dash',
    '-seg_duration',
    String(HLS_SEGMENT_SECONDS),
    '-use_template',
    '1',
    '-use_timeline',
    '1',
    '-init_seg_name',
    join(outputDir, 'dash', 'init-$RepresentationID$.m4s').replace(/\\/g, '/'),
    '-media_seg_name',
    join(outputDir, 'dash', 'chunk-$RepresentationID$-$Number%05d$.m4s').replace(/\\/g, '/'),
    join(outputDir, 'dash', 'manifest.mpd').replace(/\\/g, '/'),
  ];
  return runFfmpegCommand(args);
}

function runFfmpegCommand(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', () => {
      resolve(false);
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn(
          { code, stderr: stderr.slice(-2000), event: 'attachment.video_abr.ffmpeg_failed' },
          'ffmpeg ABR packaging failed',
        );
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function renameHlsVariantPlaylists(
  outputDir: string,
  renditions: readonly RenditionSpec[],
): Promise<void> {
  const { mkdir, rename, readFile, writeFile } = await import('node:fs/promises');
  for (let index = 0; index < renditions.length; index += 1) {
    const spec = renditions[index];
    if (spec == null) {
      continue;
    }
    const from = join(outputDir, 'hls', String(index), 'index.m3u8');
    const toDir = join(outputDir, 'hls', `${spec.height}p`);
    const to = join(toDir, 'index.m3u8');
    await mkdir(toDir, { recursive: true });
    await rename(from, to);
    const masterPath = join(outputDir, 'hls', 'master.m3u8');
    const master = await readFile(masterPath, 'utf8');
    const updated = master.replaceAll(`hls/${index}/index.m3u8`, `hls/${spec.height}p/index.m3u8`);
    await writeFile(masterPath, updated, 'utf8');
  }
}

export async function packageVideoAbrRenditions(sourceObjectName: string): Promise<boolean> {
  if (await isVideoAbrPackagingReady(sourceObjectName)) {
    return true;
  }

  const sourceHeight = await probeVideoSourceHeight(sourceObjectName);
  const heights = selectVideoAbrRenditionHeights(sourceHeight);
  const renditions = RENDITION_SPECS.filter((spec) => heights.includes(spec.height));
  if (renditions.length === 0) {
    return false;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'kanboard-video-abr-'));
  try {
    const presigned = await mintAttachmentInternalReadUrl(sourceObjectName, TRANSCODE_PRESIGN_TTL_SEC);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(workDir, 'hls'), { recursive: true });
    await mkdir(join(workDir, 'dash'), { recursive: true });
    const hlsOk = await runFfmpegHlsPackaging(presigned.url, workDir, renditions);
    if (!hlsOk) {
      return false;
    }
    await renameHlsVariantPlaylists(workDir, renditions);
    const dashOk = await runFfmpegDashRemux(workDir);
    if (!dashOk) {
      return false;
    }
    await uploadOutputTree(workDir, videoAbrStoragePrefix(sourceObjectName));
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: message, sourceObjectName, event: 'attachment.video_abr.package_failed' },
      'ABR packaging failed',
    );
    return false;
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await unlink(workDir).catch(() => undefined);
  }
}

export async function removeVideoAbrObjects(sourceObjectName: string): Promise<void> {
  const client = getMinIOClient();
  const prefix = `${videoAbrStoragePrefix(sourceObjectName)}/`;
  const keys: string[] = [];
  const stream = client.listObjectsV2(BUCKET_NAME, prefix, true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name != null && obj.name !== '') {
        keys.push(obj.name);
      }
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  if (keys.length === 0) {
    return;
  }
  await client.removeObjects(BUCKET_NAME, keys);
}

interface VideoAbrJob {
  readonly attachmentId: string;
  readonly objectName: string;
}

let activeJobs = 0;
const pendingJobs: VideoAbrJob[] = [];
const queuedKeys = new Set<string>();

function parseTranscodeConcurrency(): number {
  const raw = process.env.VIDEO_ABR_TRANSCODE_CONCURRENCY?.trim();
  if (raw == null || raw === '') {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

async function runVideoAbrJob(job: VideoAbrJob): Promise<void> {
  try {
    await packageVideoAbrRenditions(job.objectName);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: message, ...job, event: 'attachment.video_abr.job_failed' },
      'Unhandled ABR packaging failure',
    );
  }
}

function drainVideoAbrQueue(): void {
  const maxConcurrent = parseTranscodeConcurrency();
  while (activeJobs < maxConcurrent && pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (job == null) {
      break;
    }
    activeJobs += 1;
    void runVideoAbrJob(job).finally(() => {
      queuedKeys.delete(job.objectName);
      activeJobs -= 1;
      drainVideoAbrQueue();
    });
  }
}

/** ponytail: in-process queue only; upgrade to worker/Redis for multi-instance fleets. */
export function scheduleVideoAbrPackaging(params: {
  readonly attachmentId: string;
  readonly objectName: string;
}): void {
  if (queuedKeys.has(params.objectName)) {
    return;
  }
  queuedKeys.add(params.objectName);
  pendingJobs.push(params);
  setImmediate(drainVideoAbrQueue);
}

export function isVideoAbrJobQueued(objectName: string): boolean {
  return queuedKeys.has(objectName);
}

/** Test-only: wait until the in-process ABR queue is idle. */
export async function flushVideoAbrQueueForTests(): Promise<void> {
  while (activeJobs > 0 || pendingJobs.length > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}
