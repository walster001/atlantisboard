/**
 * Client-side post-login path (sessionStorage). Keeps intended SPA paths off the /login URL.
 * Rules mirror server `isSafeOAuthNextPath` for open-redirect safety.
 */

export const POST_LOGIN_REDIRECT_STORAGE_KEY = 'kanboard:post-login-redirect-v1';

export function isSafeAppInternalPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }
  if (path.includes('..')) {
    return false;
  }
  if (path.length > 2048) {
    return false;
  }
  if (path.startsWith('/login') || path.startsWith('/register')) {
    return false;
  }
  return true;
}

export function storePostLoginRedirect(path: string): void {
  if (!isSafeAppInternalPath(path)) {
    return;
  }
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, path);
  } catch {
    /* private mode / quota */
  }
}

/** Read and remove stored path, or `null` if none / invalid. */
export function consumePostLoginRedirect(): string | null {
  try {
    const v = sessionStorage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    if (v && isSafeAppInternalPath(v)) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}
