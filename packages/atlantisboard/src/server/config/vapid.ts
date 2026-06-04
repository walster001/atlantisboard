import webpush from 'web-push';
import { getAdminConfig } from '../services/adminService.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

let cachedVapidKeys: { publicKey: string; privateKey: string } | null = null;

/**
 * Get VAPID keys from AdminConfig
 * If not configured, generates new keys and stores them
 */
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  try {
    const config = await getAdminConfig();
    const adminConfig = config.toObject() as { vapidKeys?: { publicKey?: string; privateKey?: string } };

    if (adminConfig.vapidKeys?.publicKey && adminConfig.vapidKeys?.privateKey) {
      // Decrypt private key
      let privateKey = adminConfig.vapidKeys.privateKey;
      try {
        privateKey = await decrypt(privateKey);
      } catch (error) {
        // If decryption fails, assume it's not encrypted (for migration)
        logger.warn({ error }, 'Failed to decrypt VAPID private key, assuming unencrypted');
      }

      cachedVapidKeys = {
        publicKey: adminConfig.vapidKeys.publicKey,
        privateKey,
      };

      return cachedVapidKeys;
    }

    // Generate new keys if not configured
    const vapidKeys = webpush.generateVAPIDKeys();

    // Note: Keys should be stored in AdminConfig by admin via API
    // For now, cache them for this session
    cachedVapidKeys = vapidKeys;

    logger.warn('VAPID keys not configured in AdminConfig, using generated keys (will not persist)');
    return vapidKeys;
  } catch (error) {
    logger.error({ error }, 'Failed to get VAPID keys, generating temporary keys');
    const vapidKeys = webpush.generateVAPIDKeys();
    cachedVapidKeys = vapidKeys;
    return vapidKeys;
  }
}

/**
 * Initialize web-push with VAPID keys
 */
export async function initializeVapid(): Promise<void> {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    keys.publicKey,
    keys.privateKey
  );
  logger.info('VAPID keys initialized');
}

/**
 * Get VAPID public key (for client subscription)
 */
export async function getVapidPublicKey(): Promise<string> {
  const keys = await getVapidKeys();
  return keys.publicKey;
}

