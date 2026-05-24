const MIN_SECRET_LENGTH = 32;

/** Known placeholder values from .env.example and setup scripts. */
const INSECURE_SECRET_VALUES = new Set([
  '',
  'change-this-secret-in-production',
  'your-secret-key-change-in-production',
  'change-this-session-secret-in-production',
  'your-session-secret-change-in-production',
  'change-this-csrf-secret-in-production',
  'change-this-to-a-secure-random-string-in-production',
]);

function isInsecureSecret(value: string | undefined): boolean {
  if (value == null || value.trim() === '') {
    return true;
  }
  if (INSECURE_SECRET_VALUES.has(value)) {
    return true;
  }
  return value.length < MIN_SECRET_LENGTH;
}

/**
 * Fail fast in production when JWT, session, CSRF, or encryption secrets
 * are missing, too short, or still set to documented placeholders.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const secretEnvVars = ['JWT_SECRET', 'SESSION_SECRET', 'CSRF_SECRET', 'ENCRYPTION_KEY'] as const;
  const failures: string[] = [];

  for (const envVar of secretEnvVars) {
    if (isInsecureSecret(process.env[envVar])) {
      failures.push(envVar);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Production startup blocked: insecure or missing secrets (${failures.join(', ')}). ` +
        'Generate values with: openssl rand -base64 48'
    );
  }
}
