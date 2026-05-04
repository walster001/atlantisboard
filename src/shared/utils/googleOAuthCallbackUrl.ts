/**
 * Normalizes Google OAuth redirect URI values. Google Cloud Console copy/paste
 * sometimes appends a separate token such as ` flowName=GeneralOAuthFlow`, and
 * some UIs add `flowName` as a query parameter — neither belong in the
 * callback URL stored for Passport.
 */
export function normalizeGoogleOAuthCallbackUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  const firstSegment = trimmed.split(/\s+/)[0] ?? trimmed;
  try {
    const hasAbsoluteOrigin = /^[a-z][a-z0-9+.-]*:/i.test(firstSegment);
    const base = 'https://placeholder.invalid';
    const parsed = new URL(firstSegment, base);
    parsed.searchParams.delete('flowName');
    const pathAndQuery =
      parsed.pathname + (parsed.search === '?' || parsed.search === '' ? '' : parsed.search);
    if (!hasAbsoluteOrigin && firstSegment.startsWith('/')) {
      return pathAndQuery;
    }
    if (hasAbsoluteOrigin) {
      return parsed.toString();
    }
    return pathAndQuery;
  } catch {
    return firstSegment;
  }
}

/**
 * Passport `passport-oauth2` resolves a **relative** `callbackURL` against the current request
 * (`url.resolve(originalURL(req), callbackURL)`), so Google receives `redirect_uri` matching the
 * browser host (e.g. `http://192.168.1.206:3000/...` on LAN dev).
 *
 * In **non-production**, if the configured value is an absolute URL whose host is loopback
 * (`localhost` / `127.0.0.1`), strip to path+query so LAN access is not forced back to localhost.
 */
export function resolvePassportGoogleOAuthCallbackUrl(
  normalized: string,
  nodeEnv: string | undefined,
): string {
  if (nodeEnv === 'production') {
    return normalized;
  }
  const t = normalized.trim();
  if (t === '' || t.startsWith('/')) {
    return t;
  }
  try {
    const u = new URL(t);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.pathname + (u.search === '?' || u.search === '' ? '' : u.search);
    }
  } catch {
    return normalized;
  }
  return normalized;
}

/**
 * Parses `GOOGLE_OAUTH_BROWSER_ORIGIN` (e.g. `http://kanboard.local:3000`). Scheme must be `http:` or `https:`.
 * Returns the URL origin only so a mistaken path in env does not change the authorize path.
 */
export function parseGoogleOAuthBrowserOrigin(raw: string | undefined): URL | null {
  const t = raw?.trim() ?? '';
  if (t === '') {
    return null;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    return new URL(u.origin);
  } catch {
    return null;
  }
}

/** Path + query for the Google OAuth callback, from a normalized callback string (relative or absolute). */
export function extractGoogleOAuthCallbackPathAndQuery(normalizedCallback: string): string {
  const n = normalizedCallback.trim();
  if (n.startsWith('/')) {
    return n;
  }
  try {
    const u = new URL(n);
    return u.pathname + (u.search === '?' || u.search === '' ? '' : u.search);
  } catch {
    return '/api/v1/auth/google/callback';
  }
}

/**
 * When `googleOAuthBrowserOrigin` is set, Passport uses that origin + callback path so Google Cloud
 * Console can list a hostname redirect URI (private IPs are rejected). Users should open the app at
 * that same origin (or rely on the server redirect from `/auth/google` when the Host header is an IP).
 */
export function resolveGoogleOAuthPassportCallbackUrl(input: {
  readonly normalizedCallback: string;
  readonly nodeEnv: string | undefined;
  readonly googleOAuthBrowserOrigin: string | undefined;
}): string {
  const origin = parseGoogleOAuthBrowserOrigin(input.googleOAuthBrowserOrigin);
  if (origin !== null) {
    const path = extractGoogleOAuthCallbackPathAndQuery(input.normalizedCallback);
    return `${origin.origin}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return resolvePassportGoogleOAuthCallbackUrl(input.normalizedCallback, input.nodeEnv);
}

/** Absolute URL to start the Google OAuth browser flow, or `null` when no browser origin is configured. */
export function googleOAuthAuthorizeStartUrl(
  browserOriginRaw: string | undefined,
  authorizePath = '/api/v1/auth/google',
): string | null {
  const o = parseGoogleOAuthBrowserOrigin(browserOriginRaw);
  if (o === null) {
    return null;
  }
  const p = authorizePath.startsWith('/') ? authorizePath : `/${authorizePath}`;
  return `${o.origin}${p}`;
}

/**
 * If the request hit `/api/v1/auth/google` on a host other than the configured browser origin,
 * redirect to the same path + query on that origin so Passport state and `redirect_uri` stay aligned.
 */
export function googleOAuthRedirectToBrowserOriginIfNeeded(
  browserOriginRaw: string | undefined,
  requestHost: string | undefined,
  originalUrl: string,
): string | null {
  const o = parseGoogleOAuthBrowserOrigin(browserOriginRaw);
  if (o === null) {
    return null;
  }
  const rh = requestHost?.trim().toLowerCase() ?? '';
  if (rh === '' || rh === o.host.toLowerCase()) {
    return null;
  }
  const pathPart = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`;
  return `${o.origin}${pathPart}`;
}
