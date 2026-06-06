/**
 * Google returns `invalid_request: device_id and device_name are required for private IP`
 * when `redirect_uri` uses certain private / link-local hosts. We attach those query
 * parameters on the authorization request in that case only.
 *
 * @see https://stackoverflow.com/questions/24736168/error-invalid-request-device-id-and-device-name-are-required-for-private-ip
 */

function parseIpv4(hostname: string): readonly [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) {
    return null;
  }
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return octets;
}

/** Host part of the HTTP `Host` header (strips port; supports bracketed IPv6). */
export function hostnameFromRequestHostHeader(hostHeader: string | undefined): string {
  if (hostHeader === undefined || hostHeader.trim() === '') {
    return '';
  }
  try {
    let hn = new URL(`http://${hostHeader.trim()}`).hostname;
    if (hn.startsWith('[') && hn.endsWith(']')) {
      hn = hn.slice(1, -1);
    }
    return hn;
  } catch {
    return hostHeader.split(':')[0]?.trim() ?? '';
  }
}

/**
 * True when the browser-facing host for OAuth is a private / non-routable address
 * where Google expects `device_id` + `device_name` on the authorize URL.
 * Excludes loopback (`127.0.0.1`, `::1`, `localhost`).
 */
export function isGoogleOAuthPrivateIpHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (h === '' || h === 'localhost') {
    return false;
  }
  const ipv4 = parseIpv4(h);
  if (ipv4 !== null) {
    const [a, b] = ipv4;
    if (a === 127) {
      return false;
    }
    if (a === 10) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    return false;
  }
  if (h === '::1') {
    return false;
  }
  // IPv6 link-local fe80::/10
  if (
    h.startsWith('fe8') ||
    h.startsWith('fe9') ||
    h.startsWith('fea') ||
    h.startsWith('feb')
  ) {
    return true;
  }
  // IPv6 unique local fc00::/7
  if (h.startsWith('fc') || h.startsWith('fd')) {
    return true;
  }
  return false;
}

const MAX_DEVICE_FIELD_LEN = 128;

function sanitizeDeviceSegment(raw: string, maxLen: number): string {
  const t = raw.trim().replace(/[\r\n\0]/g, '');
  return t.length <= maxLen ? t : t.slice(0, maxLen);
}

/**
 * Values for Google's authorize URL when using a private-IP redirect host.
 * Prefer explicit env; otherwise derive stable-ish defaults from the host / OS.
 */
export function resolveGoogleOAuthLanDeviceParams(
  oauthHostname: string,
  env: Readonly<NodeJS.ProcessEnv>,
  osHostname: () => string,
): Readonly<{ readonly device_id: string; readonly device_name: string }> {
  const idFromEnv = env.GOOGLE_OAUTH_DEVICE_ID?.trim();
  const nameFromEnv = env.GOOGLE_OAUTH_DEVICE_NAME?.trim();
  const safeHost = oauthHostname.replace(/[^a-zA-Z0-9.-]/g, '-').slice(0, 64);
  const device_id = sanitizeDeviceSegment(
    idFromEnv && idFromEnv.length > 0 ? idFromEnv : `private-ip-${safeHost}`,
    MAX_DEVICE_FIELD_LEN,
  );
  const device_name = sanitizeDeviceSegment(
    nameFromEnv && nameFromEnv.length > 0 ? nameFromEnv : `${osHostname()} (LAN)`,
    MAX_DEVICE_FIELD_LEN,
  );
  return { device_id, device_name };
}

export function googleOAuthLanDeviceParamsForHostHeader(
  hostHeader: string | undefined,
  env: Readonly<NodeJS.ProcessEnv>,
  osHostname: () => string,
): Readonly<{ readonly device_id: string; readonly device_name: string }> | null {
  const hn = hostnameFromRequestHostHeader(hostHeader);
  if (!isGoogleOAuthPrivateIpHostname(hn)) {
    return null;
  }
  return resolveGoogleOAuthLanDeviceParams(hn, env, osHostname);
}
