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
