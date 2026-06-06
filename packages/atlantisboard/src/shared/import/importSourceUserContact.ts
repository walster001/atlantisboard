import { isSyntheticImportPlaceholderEmail } from './importPlaceholderDisplay.js';
import type { ImportPreflightUser } from './importPreflight.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeImportSourceEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || !EMAIL_RE.test(trimmed) || isSyntheticImportPlaceholderEmail(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Wekan often stores the login identity in `username` (e.g. Google accounts use the Gmail address).
 */
export function wekanUsernameAsEmail(record: Record<string, unknown>): string | undefined {
  return normalizeImportSourceEmail(record.username);
}

/**
 * Reads an email from Wekan user JSON (several export shapes).
 */
export function emailFromWekanUserRecord(record: Record<string, unknown>): string | undefined {
  const direct = normalizeImportSourceEmail(record.email) ?? normalizeImportSourceEmail(record.mail);
  if (direct != null) {
    return direct;
  }

  const profile = record.profile;
  if (profile != null && typeof profile === 'object' && !Array.isArray(profile)) {
    const fromProfile = normalizeImportSourceEmail((profile as Record<string, unknown>).email);
    if (fromProfile != null) {
      return fromProfile;
    }
  }

  const fromWekanUsername = wekanUsernameAsEmail(record);
  if (fromWekanUsername != null) {
    return fromWekanUsername;
  }

  if (Array.isArray(record.emails)) {
    for (const entry of record.emails) {
      if (typeof entry === 'string') {
        const parsed = normalizeImportSourceEmail(entry);
        if (parsed != null) {
          return parsed;
        }
        continue;
      }
      if (entry != null && typeof entry === 'object' && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>;
        const parsed =
          normalizeImportSourceEmail(e.address) ??
          normalizeImportSourceEmail(e.email) ??
          normalizeImportSourceEmail(e.value);
        if (parsed != null) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

/**
 * Reads an email from Trello member JSON.
 */
export function emailFromTrelloMemberRecord(record: Record<string, unknown>): string | undefined {
  const direct =
    normalizeImportSourceEmail(record.email) ??
    normalizeImportSourceEmail(record.emailAddress) ??
    normalizeImportSourceEmail(record.memberEmail);
  if (direct != null) {
    return direct;
  }

  const prefs = record.prefs;
  if (prefs != null && typeof prefs === 'object' && !Array.isArray(prefs)) {
    const fromPrefs = normalizeImportSourceEmail((prefs as Record<string, unknown>).email);
    if (fromPrefs != null) {
      return fromPrefs;
    }
  }

  return undefined;
}

export function importPreflightUserFromWekanRecord(record: Record<string, unknown>): ImportPreflightUser | null {
  const sourceUserId = str(record._id);
  if (sourceUserId == null) {
    return null;
  }
  const rawUsername = str(record.username);
  const emailFromUsername = rawUsername != null ? wekanUsernameAsEmail(record) : undefined;
  const email = emailFromWekanUserRecord(record) ?? emailFromUsername;
  const importLoginUsername =
    rawUsername != null && emailFromUsername == null ? rawUsername.toLowerCase() : undefined;
  const profile = record.profile;
  const fullName =
    profile != null && typeof profile === 'object' && !Array.isArray(profile)
      ? str((profile as Record<string, unknown>).fullname) ?? str((profile as Record<string, unknown>).fullName)
      : str(record.fullname) ?? str(record.fullName) ?? str(record.name);

  return {
    sourceUserId,
    ...(fullName != null ? { fullName } : {}),
    ...(email != null ? { email } : {}),
    ...(importLoginUsername != null ? { username: importLoginUsername } : {}),
  };
}

export function importPreflightUserFromTrelloMemberRecord(record: Record<string, unknown>): ImportPreflightUser | null {
  const sourceUserId = str(record.id) ?? str(record._id);
  if (sourceUserId == null) {
    return null;
  }
  const email = emailFromTrelloMemberRecord(record);
  const username = str(record.username);
  const fullName = str(record.fullName) ?? str(record.fullname) ?? str(record.name);

  return {
    sourceUserId,
    ...(fullName != null ? { fullName } : {}),
    ...(email != null ? { email } : {}),
    ...(username != null ? { username } : {}),
  };
}

export function buildImportPreflightUserIndex(
  users: readonly ImportPreflightUser[],
): Map<string, ImportPreflightUser> {
  const index = new Map<string, ImportPreflightUser>();
  for (const user of users) {
    index.set(user.sourceUserId, user);
  }
  return index;
}
