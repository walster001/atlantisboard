import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 86_400;

function signingSecret(): string {
  const media = process.env.MEDIA_SIGN_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (media == null || media === '') {
      throw new Error('MEDIA_SIGN_SECRET is required in production');
    }
    return media;
  }
  return (
    media ||
    process.env.JWT_SECRET?.trim() ||
    'change-this-secret-in-production'
  );
}

function hmacHex(payload: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

/** Append `exp` + `sig` query params for time-limited public asset access. */
export function createSignedAssetUrl(path: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const sig = hmacHex(`${normalizedPath}:${exp}`);
  const separator = normalizedPath.includes('?') ? '&' : '?';
  return `${normalizedPath}${separator}exp=${exp}&sig=${sig}`;
}

export function verifySignedAssetUrl(
  path: string,
  expRaw: string | undefined,
  sigRaw: string | undefined,
): boolean {
  if (expRaw == null || sigRaw == null || expRaw === '' || sigRaw === '') {
    return false;
  }
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const expected = hmacHex(`${normalizedPath}:${exp}`);
  const provided = sigRaw.trim();
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function rewriteBrandingPathToSigned(path: string | undefined): string | undefined {
  if (path == null || path.trim() === '') {
    return path;
  }
  const trimmed = path.trim();
  const pathOnly = (trimmed.split('?')[0] ?? trimmed).split('#')[0] ?? trimmed;
  if (!pathOnly.startsWith('/api/v1/branding/')) {
    return trimmed;
  }
  return createSignedAssetUrl(pathOnly);
}
