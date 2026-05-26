import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { appendFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';
import { logger } from './logger.js';

const scryptAsync = promisify(scrypt);
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;

function resolveEncryptionKey(): string {
  if (process.env.ENCRYPTION_KEY) {
    return process.env.ENCRYPTION_KEY;
  }

  const generated = randomBytes(32).toString('hex');

  try {
    const envPath = resolve(process.cwd(), '.env');
    const contents = readFileSync(envPath, 'utf8');
    if (!contents.includes('ENCRYPTION_KEY=')) {
      const separator = contents.endsWith('\n') ? '' : '\n';
      appendFileSync(envPath, `${separator}\n# Auto-generated encryption key — do not remove\nENCRYPTION_KEY=${generated}\n`);
      logger.info('ENCRYPTION_KEY generated and persisted to .env');
    }
  } catch {
    logger.warn('Could not persist ENCRYPTION_KEY to .env — encrypted data will not survive restarts');
  }

  process.env.ENCRYPTION_KEY = generated;
  return generated;
}

const ENCRYPTION_KEY = resolveEncryptionKey();

async function getKey(salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(ENCRYPTION_KEY, salt, KEY_LENGTH)) as Buffer;
}

export async function encrypt(text: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await getKey(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return salt:iv:authTag:encrypted
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export async function decrypt(encryptedText: string): Promise<string> {
  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted text format');
  }

  const [saltHex, ivHex, authTagHex, encrypted] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const key = await getKey(salt);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

