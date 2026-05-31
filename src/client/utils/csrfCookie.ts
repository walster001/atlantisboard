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

/** Wait until the CSRF cookie is visible after Set-Cookie (avoids header-only POSTs). */
export async function waitForCsrfCookie(timeoutMs = 2000): Promise<string | null> {
  const immediate = readCsrfCookie();
  if (immediate) {
    return immediate;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 16);
    });
    const token = readCsrfCookie();
    if (token) {
      return token;
    }
  }
  return null;
}
