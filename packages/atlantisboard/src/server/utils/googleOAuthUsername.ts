import { User } from '../models/User.js';

const MIN_LEN = 3;
const MAX_LEN = 50;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Usernames must be 3–50 chars (see User schema). Email local parts can be shorter.
 * Ensures a unique username for Google OAuth user creation.
 */
export async function deriveUniqueUsernameForGoogleOAuth(
  email: string,
  googleId: string
): Promise<string> {
  const localRaw = email.split('@')[0] || '';
  const fromLocal = sanitizeSegment(localRaw).slice(0, MAX_LEN);
  const idPart = sanitizeSegment(googleId).slice(0, 24) || 'oauth';

  let base: string;
  if (fromLocal.length >= MIN_LEN) {
    base = fromLocal;
  } else if (fromLocal.length > 0) {
    base = `${fromLocal}_${idPart}`.slice(0, MAX_LEN);
  } else {
    base = `g_${idPart}`.slice(0, MAX_LEN);
  }

  if (base.length < MIN_LEN) {
    base = `user_${idPart}`.slice(0, MAX_LEN);
  }

  let candidate = base;
  let n = 0;
  while (await User.exists({ username: candidate })) {
    n += 1;
    const suffix = `_${n}`;
    candidate = `${base.slice(0, Math.max(MIN_LEN, MAX_LEN - suffix.length))}${suffix}`;
  }
  return candidate;
}
