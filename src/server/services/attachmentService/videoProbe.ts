import { spawn } from 'node:child_process';
import { logger } from '../../utils/logger.js';
import { mintAttachmentInternalReadUrl } from './urls.js';

const PROBE_PRESIGN_TTL_SEC = 120;

function probeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function probeVideoHeightFromUrl(inputUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffprobe',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=height',
        '-of',
        'csv=p=0',
        inputUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    proc.on('error', (error) => {
      logger.warn(
        { error: probeErrorMessage(error), event: 'attachment.video_probe.spawn_failed' },
        'ffprobe spawn failed',
      );
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn(
          { code, stderr: stderr.slice(-500), event: 'attachment.video_probe.exit_failed' },
          'ffprobe exited with error',
        );
        resolve(null);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      const parsed = Number.parseInt(raw, 10);
      resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    });
  });
}

export async function probeVideoSourceHeight(objectName: string): Promise<number | null> {
  try {
    const presigned = await mintAttachmentInternalReadUrl(objectName, PROBE_PRESIGN_TTL_SEC);
    return await probeVideoHeightFromUrl(presigned.url);
  } catch (error: unknown) {
    logger.warn(
      { error: probeErrorMessage(error), objectName, event: 'attachment.video_probe.failed' },
      'ffprobe failed',
    );
    return null;
  }
}
