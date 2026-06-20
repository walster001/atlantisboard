import { spawn } from 'node:child_process';

/** Limit decode to the first second of media when extracting a poster frame. */
const POSTER_DECODE_MAX_SEC = 1;

export function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('video/');
}

/** Map WebP-style quality (0–100) to ffmpeg MJPEG `-q:v` (2 = best, 31 = worst). */
export function ffmpegMjpegQualityFromPreset(quality: number): number {
  const clamped = Math.max(1, Math.min(100, quality));
  return Math.max(2, Math.min(31, Math.round(2 + ((100 - clamped) * 29) / 100)));
}

/** Extract one JPEG frame via ffmpeg from a presigned URL. */
export async function extractVideoFrameFromPresignedUrl(
  presignedUrl: string,
  jpegQuality: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
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

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.on('error', () => {
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}
