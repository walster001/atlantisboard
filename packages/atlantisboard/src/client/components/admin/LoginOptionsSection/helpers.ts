import type { ChangeEvent } from 'react';

export type DefaultAuthMethod = 'email' | 'email-google' | 'google' | 'google-external';

export type RegistrationMode = 'open' | 'invite-only' | 'disabled';

export interface AdminConfigShape {
  authMethods: {
    emailPassword: boolean;
    googleOAuth: boolean;
    googleOAuthExternalMySQL: boolean;
  };
  googleOAuth: {
    enabled: boolean;
    clientIdSet?: boolean;
    clientSecretSet?: boolean;
    callbackUrlSet?: boolean;
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
  };
  externalMySQL: {
    enabled: boolean;
    credentialsConfigured?: boolean;
    passwordSet?: boolean;
    verificationQuerySet?: boolean;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    verificationQuery?: string;
  };
  defaultAuthMethod: DefaultAuthMethod;
  registrationMode: RegistrationMode;
  requireEmailVerification: boolean;
}

export interface MysqlDraft {
  host: string;
  database: string;
  username: string;
  password: string;
  verificationQuery: string;
}

export interface GoogleDraft {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export const DEFAULT_VERIFICATION_SQL = 'SELECT 1 FROM users WHERE email = ? LIMIT 1';

export function readInputValue(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): string {
  return event.currentTarget?.value ?? '';
}

export function splitMysqlHostInput(raw: string, defaultPort: number): { host: string; port: number } {
  const trimmed = raw.trim();
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0) {
    const maybePort = trimmed.slice(lastColon + 1);
    if (/^\d{1,5}$/.test(maybePort)) {
      return { host: trimmed.slice(0, lastColon), port: Number(maybePort) };
    }
  }
  return { host: trimmed, port: defaultPort };
}

export function formatMysqlHostForDisplay(host: string | undefined, port: number | undefined): string {
  if (!host) return '';
  if (port !== undefined && port !== 3306) return `${host}:${port}`;
  return host;
}

export function registrationModeDescription(
  authMethod: DefaultAuthMethod,
  mode: RegistrationMode,
): string {
  const modeLabel =
    mode === 'open'
      ? 'Open — anyone can create a new account.'
      : mode === 'invite-only'
        ? 'Invite-only — new accounts require an administrator or invite link.'
        : 'Disabled — no new accounts; existing users can still sign in.';

  if (authMethod === 'email') {
    return `Controls who can register with email and password. ${modeLabel}`;
  }
  if (authMethod === 'email-google') {
    return `Controls who can register with email/password or Google. ${modeLabel}`;
  }
  if (authMethod === 'google') {
    return `Controls who can sign up with Google for the first time. ${modeLabel}`;
  }
  return `Controls who can create a new account via Google (with database verification). ${modeLabel}`;
}

export function applyAuthMode(prev: AdminConfigShape, mode: DefaultAuthMethod): AdminConfigShape {
  const google = prev.googleOAuth ?? { enabled: false };
  const external = prev.externalMySQL ?? { enabled: false };
  if (mode === 'email') {
    return {
      ...prev,
      defaultAuthMethod: 'email',
      authMethods: { emailPassword: true, googleOAuth: false, googleOAuthExternalMySQL: false },
      googleOAuth: { ...google, enabled: false },
      externalMySQL: { ...external, enabled: false },
    };
  }
  if (mode === 'email-google') {
    return {
      ...prev,
      defaultAuthMethod: 'email-google',
      authMethods: { emailPassword: true, googleOAuth: true, googleOAuthExternalMySQL: false },
      googleOAuth: { ...google, enabled: true },
      externalMySQL: { ...external, enabled: false },
      requireEmailVerification: true,
    };
  }
  if (mode === 'google') {
    return {
      ...prev,
      defaultAuthMethod: 'google',
      authMethods: { emailPassword: false, googleOAuth: true, googleOAuthExternalMySQL: false },
      googleOAuth: { ...google, enabled: true },
      externalMySQL: { ...external, enabled: false },
    };
  }
  return {
    ...prev,
    defaultAuthMethod: 'google-external',
    authMethods: { emailPassword: false, googleOAuth: true, googleOAuthExternalMySQL: true },
    googleOAuth: { ...google, enabled: true },
    externalMySQL: { ...external, enabled: true },
  };
}
