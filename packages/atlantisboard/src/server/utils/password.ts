import { logger } from './logger.js';

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_PASSWORD_LENGTH = 12;

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function hashPassword(password: string): Promise<string> {
  try {
    // Bun.password uses Argon2id by default with appropriate rounds
    if (typeof Bun === 'undefined' || !Bun.password) {
      throw new Error('Bun runtime not available');
    }

    const hash = await Bun.password.hash(password, {
      algorithm: 'argon2id',
      memoryCost: 65536, // 64 MB
      timeCost: 10, // minimum 10 rounds as per OWASP
    });
    return hash;
  } catch (error) {
    logger.error({ error }, 'Error hashing password');
    throw new Error('Failed to hash password');
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (typeof Bun === 'undefined' || !Bun.password) {
      throw new Error('Bun runtime not available');
    }

    return await Bun.password.verify(password, hash);
  } catch (error) {
    logger.error({ error }, 'Error verifying password');
    return false;
  }
}

