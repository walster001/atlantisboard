import { AdminConfig, type IAdminConfig, type IExternalMySQL, type IGoogleOAuth } from '../models/AdminConfig.js';
import { encrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import type mongoose from 'mongoose';
import { DEFAULT_VERIFICATION_QUERY } from './mysqlService.js';
import { normalizeGoogleOAuthCallbackUrl } from '../../shared/utils/googleOAuthCallbackUrl.js';
import { normalizeDefaultUiFontFamilyInput } from './fontService.js';

const ENCRYPTED_PLACEHOLDER = '***ENCRYPTED***';

export function isExternalMysqlCredentialsStored(ext: IExternalMySQL | undefined): boolean {
  return !!(
    ext?.host?.trim() &&
    ext?.database?.trim() &&
    ext?.username?.trim() &&
    ext?.password
  );
}

function isGoogleOAuthCredentialsStored(go: IGoogleOAuth | undefined): boolean {
  return !!(go?.clientId?.trim() && go?.clientSecret);
}

/**
 * JSON-safe admin config for authenticated app admins. Omits secret connection
 * details once stored; flags indicate configured state.
 */
export function sanitizeAdminConfigForClient(config: IAdminConfig): Record<string, unknown> {
  const o = config.toObject();
  const ext = o.externalMySQL;
  const extConfigured = isExternalMysqlCredentialsStored(ext);
  const go = o.googleOAuth;
  const googleConfigured = isGoogleOAuthCredentialsStored(go);

  const safeExternal: Record<string, unknown> = {
    enabled: ext.enabled,
    credentialsConfigured: extConfigured,
    passwordSet: !!ext.password,
    verificationQuerySet: !!(ext.verificationQuery && ext.verificationQuery.trim() !== ''),
  };

  if (!extConfigured) {
    safeExternal.host = ext.host ?? '';
    safeExternal.port = ext.port;
    safeExternal.database = ext.database ?? '';
    safeExternal.username = ext.username ?? '';
    safeExternal.password = ext.password ? ENCRYPTED_PLACEHOLDER : undefined;
    safeExternal.verificationQuery = ext.verificationQuery?.trim() || DEFAULT_VERIFICATION_QUERY;
  }

  const safeGoogle: Record<string, unknown> = {
    enabled: go.enabled,
  };

  if (googleConfigured) {
    safeGoogle.clientIdSet = true;
    safeGoogle.clientSecretSet = true;
    safeGoogle.callbackUrlSet = !!(go.callbackUrl && go.callbackUrl.trim() !== '');
  } else {
    safeGoogle.clientId = go.clientId ?? '';
    safeGoogle.clientSecret = go.clientSecret ? ENCRYPTED_PLACEHOLDER : undefined;
    safeGoogle.callbackUrl = go.callbackUrl ?? '';
  }

  return {
    ...o,
    googleOAuth: safeGoogle,
    externalMySQL: safeExternal,
  };
}

/**
 * Get admin configuration
 */
export async function getAdminConfig(): Promise<IAdminConfig> {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig({
      updatedBy: new (await import('mongoose')).default.Types.ObjectId(),
    });
    await config.save();
  }
  return config;
}

/**
 * Update admin configuration (partial updates; preserves encrypted secrets when omitted or placeholder).
 */
export async function updateAdminConfig(
  updates: Record<string, unknown>,
  userId: string
): Promise<IAdminConfig> {
  const config = await getAdminConfig();
  const u = updates as Partial<IAdminConfig>;

  if (u.authMethods) {
    config.authMethods = {
      emailPassword: u.authMethods.emailPassword ?? config.authMethods.emailPassword,
      googleOAuth: u.authMethods.googleOAuth ?? config.authMethods.googleOAuth,
      googleOAuthExternalMySQL:
        u.authMethods.googleOAuthExternalMySQL ?? config.authMethods.googleOAuthExternalMySQL,
    };
  }

  if (u.defaultAuthMethod !== undefined) {
    config.defaultAuthMethod = u.defaultAuthMethod;
  }

  if (u.googleOAuth) {
    const go = u.googleOAuth as Partial<IGoogleOAuth> & { replaceGoogleOAuth?: boolean };
    if (go.enabled !== undefined) {
      config.googleOAuth.enabled = go.enabled;
    }
    const googleStored = isGoogleOAuthCredentialsStored(config.googleOAuth);
    const replaceGoogle = go.replaceGoogleOAuth === true;

    if (replaceGoogle || !googleStored) {
      if (go.clientId !== undefined) {
        config.googleOAuth.clientId = go.clientId;
      }
      if (go.callbackUrl !== undefined) {
        const cu =
          typeof go.callbackUrl === 'string'
            ? normalizeGoogleOAuthCallbackUrl(go.callbackUrl)
            : '';
        config.googleOAuth.callbackUrl = cu;
      }
    } else {
      if (go.clientId !== undefined && go.clientId.trim() !== '') {
        config.googleOAuth.clientId = go.clientId;
      }
      if (go.callbackUrl !== undefined && go.callbackUrl.trim() !== '') {
        config.googleOAuth.callbackUrl = normalizeGoogleOAuthCallbackUrl(go.callbackUrl);
      }
    }

    const secret = go.clientSecret;
    if (secret && secret !== ENCRYPTED_PLACEHOLDER && secret !== '') {
      try {
        config.googleOAuth.clientSecret = await encrypt(secret);
      } catch (error) {
        logger.error({ error }, 'Failed to encrypt Google OAuth client secret');
        throw error;
      }
    }
  }

  if (u.externalMySQL) {
    const ex = u.externalMySQL as Partial<IExternalMySQL> & { replaceCredentials?: boolean };
    if (ex.enabled !== undefined) {
      config.externalMySQL.enabled = ex.enabled;
    }

    const mysqlStored = isExternalMysqlCredentialsStored(config.externalMySQL);
    const replaceMysql = ex.replaceCredentials === true;
    const applyConnection = replaceMysql || !mysqlStored;

    if (applyConnection) {
      if (ex.host !== undefined) {
        config.externalMySQL.host = ex.host;
      }
      if (ex.port !== undefined) {
        config.externalMySQL.port = ex.port;
      }
      if (ex.database !== undefined) {
        config.externalMySQL.database = ex.database;
      }
      if (ex.username !== undefined) {
        config.externalMySQL.username = ex.username;
      }

      if (ex.verificationQuery !== undefined) {
        const vq = ex.verificationQuery;
        if (vq === ENCRYPTED_PLACEHOLDER) {
          /* keep existing */
        } else if (typeof vq === 'string') {
          const trimmed = vq.trim();
          const toStore = trimmed === '' ? DEFAULT_VERIFICATION_QUERY : trimmed;
          try {
            config.externalMySQL.verificationQuery = await encrypt(toStore);
          } catch (error) {
            logger.error({ error }, 'Failed to encrypt MySQL verification query');
            throw error;
          }
        }
      }

      const pw = ex.password;
      if (pw && pw !== ENCRYPTED_PLACEHOLDER && pw !== '') {
        try {
          config.externalMySQL.password = await encrypt(pw);
        } catch (error) {
          logger.error({ error }, 'Failed to encrypt MySQL password');
          throw error;
        }
      }
    }
  }

  if (u.loginScreenBranding) {
    const existing = config.toObject().loginScreenBranding ?? {};
    const patch = u.loginScreenBranding as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...existing };
    for (const key of Object.keys(patch)) {
      const v = patch[key];
      if (v !== undefined) {
        merged[key] = v;
      }
    }
    config.set('loginScreenBranding', merged);
    config.markModified('loginScreenBranding');
  }

  if (u.appScreenBranding) {
    const existing = config.toObject().appScreenBranding ?? {};
    const patchRaw = u.appScreenBranding as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...patchRaw };
    if (Object.prototype.hasOwnProperty.call(patchRaw, 'defaultUiFontFamily')) {
      const rawFont = patchRaw.defaultUiFontFamily;
      if (rawFont === undefined) {
        delete patch.defaultUiFontFamily;
      } else {
        const normalized = await normalizeDefaultUiFontFamilyInput(rawFont);
        if (normalized === null) {
          patch.defaultUiFontFamily = null;
        } else {
          patch.defaultUiFontFamily = normalized;
        }
      }
    }
    const merged: Record<string, unknown> = { ...existing };
    for (const key of Object.keys(patch)) {
      const v = patch[key];
      if (v === undefined) {
        continue;
      }
      if (key === 'defaultUiFontFamily' && v === null) {
        delete merged.defaultUiFontFamily;
        continue;
      }
      merged[key] = v;
    }
    config.set('appScreenBranding', merged);
    config.markModified('appScreenBranding');
  }

  if (u.rateLimiting) {
    const rl = u.rateLimiting;
    config.rateLimiting = {
      authEndpoints: {
        attempts: rl.authEndpoints?.attempts ?? config.rateLimiting.authEndpoints.attempts,
        windowMinutes:
          rl.authEndpoints?.windowMinutes ?? config.rateLimiting.authEndpoints.windowMinutes,
      },
      fileUploads: {
        attempts: rl.fileUploads?.attempts ?? config.rateLimiting.fileUploads.attempts,
        windowMinutes:
          rl.fileUploads?.windowMinutes ?? config.rateLimiting.fileUploads.windowMinutes,
      },
      generalAPI: {
        attempts: rl.generalAPI?.attempts ?? config.rateLimiting.generalAPI.attempts,
        windowMinutes: rl.generalAPI?.windowMinutes ?? config.rateLimiting.generalAPI.windowMinutes,
      },
    };
  }

  if (u.vapidKeys) {
    const vk = u.vapidKeys;
    if (!config.vapidKeys) {
      config.vapidKeys = {};
    }
    if (vk.publicKey !== undefined) {
      config.vapidKeys.publicKey = vk.publicKey;
    }
    if (vk.privateKey !== undefined && vk.privateKey !== '') {
      try {
        config.vapidKeys.privateKey = await encrypt(vk.privateKey);
      } catch (error) {
        logger.error({ error }, 'Failed to encrypt VAPID private key');
        throw error;
      }
    }
  }

  config.updatedBy = new (await import('mongoose')).default.Types.ObjectId(userId) as mongoose.Types.ObjectId;
  await config.save();

  const oauthRelatedUpdate =
    u.authMethods !== undefined ||
    u.googleOAuth !== undefined ||
    u.defaultAuthMethod !== undefined;
  if (oauthRelatedUpdate) {
    try {
      const { configureGoogleStrategy } = await import('../config/passport.js');
      await configureGoogleStrategy();
    } catch (error) {
      logger.error({ error }, 'Failed to refresh Google OAuth strategy after admin config update');
    }
  }

  logAuditEvent({
    userId,
    action: 'update_admin_config',
    resourceType: 'admin_config',
    resourceId: config._id.toString(),
    timestamp: new Date(),
  });

  return config;
}
