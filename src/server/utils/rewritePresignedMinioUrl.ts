/**
 * Rewrite an internally presigned MinIO URL to a browser-facing base (e.g. APP_URL/cdn).
 * Query string (SigV4) is preserved; the app CDN proxy strips the path prefix before forwarding.
 */
export function rewritePresignedUrlToPublicBase(
  internalPresignedUrl: string,
  publicBaseUrl: string,
): string {
  const internal = new URL(internalPresignedUrl);
  const base = new URL(
    publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl,
  );
  const prefix =
    base.pathname === '/' || base.pathname === ''
      ? ''
      : base.pathname.replace(/\/$/, '');
  const pathname = `${prefix}${internal.pathname}`;
  const out = new URL(pathname + internal.search, base.origin);
  return out.toString();
}
