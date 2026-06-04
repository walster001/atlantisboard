import type { RegistrationMode } from '../models/AdminConfig.js';
import { AdminConfig } from '../models/AdminConfig.js';
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
  return mode === 'open';
}

export async function assertNewUserRegistrationAllowed(): Promise<{
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
  return {
    allowed: false,
    reason: registrationBlockReason(mode),
    mode,
  };
}
