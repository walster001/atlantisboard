/**
 * Detects URLs served by GET /api/v1/branding/:kind/:fileId (MinIO-backed assets).
 * Used client-side before calling the admin delete endpoint.
 */
const BRANDING_ASSET_PATH =
  /^\/api\/v1\/branding\/(login-logo|favicon|home-nav-icon|home-bg-image|board-nav-icon)\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg|ico)$/i;

function pathnameFromMaybeUrl(input: string): string {
  const t = input.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      return new URL(t).pathname;
    } catch {
      return '';
    }
  }
  return t.startsWith('/') ? t : `/${t}`;
}

export function isAppHostedBrandingAssetUrl(url: string): boolean {
  return BRANDING_ASSET_PATH.test(pathnameFromMaybeUrl(url));
}
