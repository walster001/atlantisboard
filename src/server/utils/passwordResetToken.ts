import crypto from 'node:crypto';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function passwordResetExpiresAt(): Date {
  return new Date(Date.now() + PASSWORD_RESET_TTL_MS);
}

export function isPasswordResetTokenExpired(expiresAt: Date | undefined): boolean {
  if (expiresAt == null) {
    return true;
  }
  return expiresAt.getTime() < Date.now();
}
