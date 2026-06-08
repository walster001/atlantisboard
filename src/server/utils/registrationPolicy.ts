import type { RegistrationMode } from '../models/AdminConfig.js';
import { AdminConfig } from '../models/AdminConfig.js';
import { BoardImportPlaceholder } from '../models/BoardImportPlaceholder.js';
import { User } from '../models/User.js';

export const DEFAULT_REGISTRATION_MODE: RegistrationMode = 'open';

export type RegistrationBlockReason = 'REGISTRATION_DISABLED' | 'REGISTRATION_INVITE_ONLY';

export function resolveRegistrationMode(
  mode: RegistrationMode | undefined | null,
): RegistrationMode {
  if (mode === 'open' || mode === 'invite-only' || mode === 'disabled') {
    return mode;
  }
  return DEFAULT_REGISTRATION_MODE;
}

export function isRegistrationModeBlocking(
  mode: RegistrationMode,
  hasExistingUsers: boolean,
): boolean {
  if (!hasExistingUsers) {
    return false;
  }
  return mode !== 'open';
}

export function registrationBlockReason(mode: RegistrationMode): RegistrationBlockReason {
  return mode === 'disabled' ? 'REGISTRATION_DISABLED' : 'REGISTRATION_INVITE_ONLY';
}

export async function countNonPlaceholderUsers(): Promise<number> {
  return User.countDocuments({ isPlaceholder: { $ne: true } });
}

/** OR clauses matching a board-import placeholder or legacy User placeholder by email/username. */
export function buildImportPlaceholderRegistrationMatch(
  emailNorm: string,
  usernameNorm?: string,
): Record<string, unknown>[] {
  const or: Record<string, unknown>[] = [];
  const email = emailNorm.trim().toLowerCase();
  if (email.length > 0) {
    or.push({ email });
    or.push({ importUsername: email });
  }
  const username = usernameNorm?.trim().toLowerCase() ?? '';
  if (username.length >= 3 && username !== email) {
    or.push({ importUsername: username });
  }
  return or;
}

export async function hasImportPlaceholderForRegistrationIdentity(
  emailNorm: string,
  usernameNorm?: string,
): Promise<boolean> {
  const email = emailNorm.trim().toLowerCase();
  if (email.length > 0) {
    const legacyUser = await User.exists({
      isPlaceholder: true,
      $or: [{ placeholderEmail: email }, { email }],
    });
    if (legacyUser != null) {
      return true;
    }
  }

  const boardMatch = buildImportPlaceholderRegistrationMatch(email, usernameNorm);
  if (boardMatch.length === 0) {
    return false;
  }
  return (await BoardImportPlaceholder.exists({ $or: boardMatch })) != null;
}

export async function hasAnyBoardImportPlaceholders(): Promise<boolean> {
  const legacyPlaceholder = await User.exists({ isPlaceholder: true });
  if (legacyPlaceholder != null) {
    return true;
  }
  return (await BoardImportPlaceholder.exists({})) != null;
}

export async function getRegistrationModeFromConfig(): Promise<RegistrationMode> {
  const cfg = await AdminConfig.findOne();
  return resolveRegistrationMode(cfg?.registrationMode);
}

export async function isNewUserRegistrationOpen(): Promise<boolean> {
  const existingCount = await countNonPlaceholderUsers();
  if (existingCount === 0) {
    return true;
  }
  const mode = await getRegistrationModeFromConfig();
  if (mode === 'open') {
    return true;
  }
  if (mode === 'invite-only') {
    return hasAnyBoardImportPlaceholders();
  }
  return false;
}

export interface NewUserRegistrationIdentity {
  readonly email?: string;
  readonly username?: string;
}

export async function assertNewUserRegistrationAllowed(
  identity?: NewUserRegistrationIdentity,
): Promise<{
  allowed: true;
} | {
  allowed: false;
  reason: RegistrationBlockReason;
  mode: RegistrationMode;
}> {
  const existingCount = await countNonPlaceholderUsers();
  if (existingCount === 0) {
    return { allowed: true };
  }
  const mode = await getRegistrationModeFromConfig();
  if (mode === 'open') {
    return { allowed: true };
  }
  if (mode === 'invite-only' && identity?.email != null && identity.email.trim() !== '') {
    const placeholderMatch = await hasImportPlaceholderForRegistrationIdentity(
      identity.email,
      identity.username,
    );
    if (placeholderMatch) {
      return { allowed: true };
    }
  }
  return {
    allowed: false,
    reason: registrationBlockReason(mode),
    mode,
  };
}
