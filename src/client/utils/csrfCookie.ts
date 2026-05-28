/** Cookie name must match `CSRF_COOKIE_NAME` in `src/server/middleware/csrf.ts`. */
export const CSRF_COOKIE_NAME = 'csrf-token';

/** Read the double-submit CSRF cookie (httpOnly: false). Prefer this over in-memory cache. */
export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const prefix = `${CSRF_COOKIE_NAME}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}
