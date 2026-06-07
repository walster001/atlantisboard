import { normalizeGoogleOAuthCallbackUrl } from '../../../../shared/utils/googleOAuthCallbackUrl.js';
import {
  DEFAULT_VERIFICATION_SQL,
  splitMysqlHostInput,
  type AdminConfigShape,
  type GoogleDraft,
  type MysqlDraft,
} from './helpers.js';

type MysqlConnectionTestPayload =
  | { useSavedCredentials: true }
  | {
      host: string;
      port?: number;
      database: string;
      username: string;
      password?: string;
      verificationQuery?: string;
    };

export function buildLoginOptionsSavePayload(args: {
  config: AdminConfigShape;
  mysqlDraft: MysqlDraft;
  googleDraft: GoogleDraft;
  mysqlReplaceMode: boolean;
  googleReplaceMode: boolean;
}): Record<string, unknown> {
  const { config, mysqlDraft, googleDraft, mysqlReplaceMode, googleReplaceMode } = args;
  const payload: Record<string, unknown> = {
    authMethods: config.authMethods,
    defaultAuthMethod: config.defaultAuthMethod,
    registrationMode: config.registrationMode,
    requireEmailVerification: config.requireEmailVerification,
  };
  const googleConfigured = !!(config.googleOAuth.clientIdSet && config.googleOAuth.clientSecretSet);
  const usesGoogle =
    config.defaultAuthMethod === 'email-google' ||
    config.defaultAuthMethod === 'google' ||
    config.defaultAuthMethod === 'google-external';
  if (usesGoogle) {
    if (googleReplaceMode || !googleConfigured) {
      const googlePayload: Record<string, unknown> = {
        enabled: config.googleOAuth.enabled,
        forceHttpsUpgrade: config.googleOAuth.forceHttpsUpgrade === true,
        clientId: googleDraft.clientId.trim(),
        callbackUrl: normalizeGoogleOAuthCallbackUrl(googleDraft.callbackUrl),
      };
      if (googleDraft.clientSecret.trim() !== '') {
        googlePayload.clientSecret = googleDraft.clientSecret;
      }
      if (googleReplaceMode) {
        googlePayload.replaceGoogleOAuth = true;
      }
      payload.googleOAuth = googlePayload;
    } else {
      payload.googleOAuth = {
        enabled: config.googleOAuth.enabled,
        forceHttpsUpgrade: config.googleOAuth.forceHttpsUpgrade === true,
      };
    }
  }

  if (config.defaultAuthMethod !== 'google-external') {
    payload.externalMySQL = { enabled: false };
    return payload;
  }

  const extConfigured = config.externalMySQL.credentialsConfigured === true;
  const includeMysqlDraft = !extConfigured || mysqlReplaceMode;
  if (!includeMysqlDraft) {
    payload.externalMySQL = { enabled: config.externalMySQL.enabled };
    return payload;
  }

  const mysqlPayload = buildExternalMysqlPayload({
    mysqlDraft,
    replaceConfiguredCredentials: extConfigured && mysqlReplaceMode,
  });
  payload.externalMySQL = mysqlPayload ?? { enabled: config.externalMySQL.enabled };
  return payload;
}

export function buildExternalMysqlPayload(args: {
  mysqlDraft: MysqlDraft;
  replaceConfiguredCredentials: boolean;
}): Record<string, unknown> | null {
  const { mysqlDraft, replaceConfiguredCredentials } = args;
  const { host, port } = splitMysqlHostInput(mysqlDraft.host.trim(), 3306);
  if (!host || mysqlDraft.database.trim() === '' || mysqlDraft.username.trim() === '') {
    return null;
  }
  return {
    enabled: true,
    replaceCredentials: replaceConfiguredCredentials,
    host,
    port,
    database: mysqlDraft.database.trim(),
    username: mysqlDraft.username.trim(),
    password: mysqlDraft.password,
    verificationQuery: mysqlDraft.verificationQuery.trim() || DEFAULT_VERIFICATION_SQL,
  };
}

export function getMysqlTestPayload(args: {
  config: AdminConfigShape;
  mysqlDraft: MysqlDraft;
  mysqlReplaceMode: boolean;
}): { payload: MysqlConnectionTestPayload | null; error: string | null } {
  const { config, mysqlDraft, mysqlReplaceMode } = args;
  const useSaved = config.externalMySQL.credentialsConfigured === true && !mysqlReplaceMode;
  if (useSaved) {
    return {
      payload: { useSavedCredentials: true },
      error: null,
    };
  }
  const { host, port } = splitMysqlHostInput(mysqlDraft.host.trim(), 3306);
  if (!host || !mysqlDraft.database.trim() || !mysqlDraft.username.trim()) {
    return {
      payload: null,
      error: 'Host, database name, and user are required to test the connection',
    };
  }
  return {
    payload: {
      host,
      port,
      database: mysqlDraft.database.trim(),
      username: mysqlDraft.username.trim(),
      password: mysqlDraft.password,
      verificationQuery: mysqlDraft.verificationQuery.trim() || DEFAULT_VERIFICATION_SQL,
    },
    error: null,
  };
}
