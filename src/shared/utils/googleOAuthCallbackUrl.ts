export type GoogleOAuthUrlBuildInput = {
  readonly configuredCallback: string | undefined;
  readonly host: string | undefined;
  readonly protocol: string | undefined;
  readonly forwardedProto: string | undefined;
  readonly forceHttps: boolean;
  readonly publicBaseUrl: string | undefined;
};

export type GoogleOAuthEnv = Readonly<{
  FORCE_HTTPS?: string | undefined;
  OAUTH_REDIRECT_BASE?: string | undefined;
  APP_URL?: string | undefined;
  CORS_ORIGIN?: string | undefined;
}>;

let googleOAuthAdminForceHttpsUpgrade: boolean | undefined;

/** Synced from AdminConfig when Google OAuth strategy is (re)configured. */
export function setGoogleOAuthAdminForceHttpsUpgrade(enabled: boolean | undefined): void {
  googleOAuthAdminForceHttpsUpgrade = enabled;
}

/** True when `FORCE_HTTPS` env is set; env overrides admin when explicitly true/false. */
export function isForceHttpsEnabled(
  env: GoogleOAuthEnv,
  adminForceHttpsUpgrade?: boolean,
): boolean {
  const raw = env.FORCE_HTTPS?.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }
  return adminForceHttpsUpgrade === true;
}

/** Public origin for OAuth redirects: `OAUTH_REDIRECT_BASE`, then `APP_URL`, then `CORS_ORIGIN`. */
export function resolveOAuthPublicBaseUrl(env: GoogleOAuthEnv): string | undefined {
  for (const key of ['OAUTH_REDIRECT_BASE', 'APP_URL', 'CORS_ORIGIN'] as const) {
    const value = env[key]?.trim();
    if (value) {
      return value.replace(/\/$/, '');
    }
  }
  return undefined;
}

export function resolveGoogleOAuthRuntimeSettings(
  env: GoogleOAuthEnv,
): { readonly forceHttps: boolean; readonly publicBaseUrl: string | undefined } {
  return {
    forceHttps: isForceHttpsEnabled(env, googleOAuthAdminForceHttpsUpgrade),
    publicBaseUrl: resolveOAuthPublicBaseUrl(env),
  };
}

/**
 * Effective request scheme for URL building behind reverse proxies.
 * Prefers `https` when `X-Forwarded-Proto` is `https` or force-HTTPS is enabled.
 */
export function resolveRequestProtocol(input: {
  readonly protocol: string | undefined;
  readonly forwardedProto: string | undefined;
  readonly forceHttps: boolean;
}): 'http' | 'https' {
  const forwarded = input.forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (forwarded === 'https') {
    return 'https';
  }
  if (input.forceHttps) {
    return 'https';
  }
  const direct = input.protocol?.replace(/:$/, '').toLowerCase();
  if (direct === 'https') {
    return 'https';
  }
  return 'http';
}

/** Upgrades an absolute `http:` URL origin to `https:` (path/query unchanged). */
export function upgradeHttpOriginToHttps(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return urlString;
  }
}

/**
 * Builds the absolute Google OAuth callback URL sent to Google as `redirect_uri`.
 * Used at request time so TLS-terminated reverse proxies resolve to `https://`.
 */
export function buildGoogleOAuthCallbackUrlAtRequest(input: GoogleOAuthUrlBuildInput): string | undefined {
  const configured = input.configuredCallback?.trim();
  if (!configured) {
    return undefined;
  }

  const path = extractGoogleOAuthCallbackPathAndQuery(
    configured.startsWith('/') ? configured : normalizeGoogleOAuthCallbackUrl(configured),
  );
  const effectiveProto = resolveRequestProtocol({
    protocol: input.protocol,
    forwardedProto: input.forwardedProto,
    forceHttps: input.forceHttps,
  });

  const publicBase = input.publicBaseUrl?.trim();
  if (publicBase) {
    try {
      const base = new URL(publicBase);
      base.protocol = effectiveProto === 'https' ? 'https:' : 'http:';
      return `${base.origin}${path.startsWith('/') ? path : `/${path}`}`;
    } catch {
      /* fall through to host-based build */
    }
  }

  const host = input.host?.trim();
  if (!host) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(configured)) {
      return effectiveProto === 'https' ? upgradeHttpOriginToHttps(configured) : configured;
    }
    return configured;
  }

  if (configured.startsWith('/') || !/^[a-z][a-z0-9+.-]*:/i.test(configured)) {
    return `${effectiveProto}://${host}${path.startsWith('/') ? path : `/${path}`}`;
  }

  try {
    const absolute = new URL(configured);
    absolute.protocol = effectiveProto === 'https' ? 'https:' : 'http:';
    return absolute.toString();
  } catch {
    return configured;
  }
}

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
 * Parses `GOOGLE_OAUTH_BROWSER_ORIGIN` (e.g. `http://atlantisboard.local:3000`). Scheme must be `http:` or `https:`.
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
  readonly forceHttps?: boolean;
  readonly publicBaseUrl?: string | undefined;
}): string {
  const origin = parseGoogleOAuthBrowserOrigin(input.googleOAuthBrowserOrigin);
  if (origin !== null) {
    const path = extractGoogleOAuthCallbackPathAndQuery(input.normalizedCallback);
    let callback = `${origin.origin}${path.startsWith('/') ? path : `/${path}`}`;
    if (input.forceHttps) {
      callback = upgradeHttpOriginToHttps(callback);
    }
    return callback;
  }

  let resolved = resolvePassportGoogleOAuthCallbackUrl(input.normalizedCallback, input.nodeEnv);
  const isRelative = resolved.startsWith('/') || !/^[a-z][a-z0-9+.-]*:/i.test(resolved);

  if (input.nodeEnv === 'production' && input.publicBaseUrl && isRelative) {
    const path = extractGoogleOAuthCallbackPathAndQuery(resolved);
    try {
      const base = new URL(input.publicBaseUrl);
      if (input.forceHttps) {
        base.protocol = 'https:';
      }
      resolved = `${base.origin}${path.startsWith('/') ? path : `/${path}`}`;
    } catch {
      /* keep resolved */
    }
  } else if (input.forceHttps && /^http:\/\//i.test(resolved)) {
    resolved = upgradeHttpOriginToHttps(resolved);
  }

  return resolved;
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
