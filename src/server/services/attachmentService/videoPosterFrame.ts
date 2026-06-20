import { spawn, type ChildProcess } from 'node:child_process';
import { parsePositiveInt } from '../../utils/parseEnvInt.js';

/** Limit decode to the first second of media when extracting a poster frame. */
const POSTER_DECODE_MAX_SEC = 1;
const DEFAULT_FFMPEG_TIMEOUT_MS = 120_000;

export function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('video/');
}

/** Map WebP-style quality (0–100) to ffmpeg MJPEG `-q:v` (2 = best, 31 = worst). */
export function ffmpegMjpegQualityFromPreset(quality: number): number {
  const clamped = Math.max(1, Math.min(100, quality));
  return Math.max(2, Math.min(31, Math.round(2 + ((100 - clamped) * 29) / 100)));
}

function getPosterFfmpegTimeoutMs(): number {
  return parsePositiveInt(process.env.VIDEO_POSTER_FFMPEG_TIMEOUT_MS, DEFAULT_FFMPEG_TIMEOUT_MS);
}

/** Extract one JPEG frame via ffmpeg from a presigned URL. */
export async function extractVideoFrameFromPresignedUrl(
  presignedUrl: string,
  jpegQuality: number,
): Promise<Buffer | null> {
  const timeoutMs = getPosterFfmpegTimeoutMs();

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const proc: ChildProcess = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-probesize',
        '32768',
        '-analyzeduration',
        '500000',
        '-ss',
        '0.1',
        '-t',
        String(POSTER_DECODE_MAX_SEC),
        '-i',
        presignedUrl,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-q:v',
        String(jpegQuality),
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const finish = (result: Buffer | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer != null) {
        clearTimeout(timer);
      }
      proc.stderr?.removeAllListeners('data');
      proc.stdout?.removeAllListeners('data');
      proc.removeAllListeners('error');
      proc.removeAllListeners('close');
      if (proc.exitCode == null && proc.signalCode == null) {
        proc.kill('SIGKILL');
      }
      resolve(result);
    };

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            finish(null);
          }, timeoutMs)
        : null;

    proc.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr?.on('data', () => {
      // Drain stderr so ffmpeg cannot block on a full pipe buffer.
    });

    proc.on('error', () => {
      finish(null);
    });

    proc.on('close', (code) => {
      if (timedOut || code !== 0 || chunks.length === 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });
  });
}
