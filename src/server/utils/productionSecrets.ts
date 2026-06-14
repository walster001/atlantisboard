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
  'change-this-media-sign-secret-in-production',
]);

const INSECURE_MINIO_ACCESS_KEYS = new Set(['', 'minioadmin']);

function isInsecureSecret(value: string | undefined): boolean {
  if (value == null || value.trim() === '') {
    return true;
  }
  if (INSECURE_SECRET_VALUES.has(value)) {
    return true;
  }
  return value.length < MIN_SECRET_LENGTH;
}

function isInsecureMinioCredential(value: string | undefined): boolean {
  if (value == null || value.trim() === '') {
    return true;
  }
  if (INSECURE_MINIO_ACCESS_KEYS.has(value)) {
    return true;
  }
  return value.length < MIN_SECRET_LENGTH;
}

/** Returns true when the MongoDB URI includes non-empty username and password. */
export function mongoUriHasCredentials(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.username !== '' && parsed.password !== '';
  } catch {
    return false;
  }
}

function assertProductionMongoUri(): void {
  const uri = process.env.MONGODB_URI?.trim();
  if (uri == null || uri === '') {
    throw new Error(
      'Production startup blocked: MONGODB_URI is required and must include username and password (SCRAM auth). ' +
        'Example: mongodb://kanboard_app:SECRET@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0'
    );
  }
  if (!mongoUriHasCredentials(uri)) {
    throw new Error(
      'Production startup blocked: MONGODB_URI must include credentials. ' +
        'Enable MongoDB authentication and use a least-privilege application user.'
    );
  }
  if (!uri.includes('replicaSet=')) {
    throw new Error(
      'Production startup blocked: MONGODB_URI must include replicaSet= (required for change streams). ' +
        'Add ?replicaSet=rs0 or your cluster replica set name.'
    );
  }
}

function assertMediaSignSecretDistinctFromJwt(): void {
  const media = process.env.MEDIA_SIGN_SECRET?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  if (isInsecureSecret(media)) {
    throw new Error(
      'Production startup blocked: MEDIA_SIGN_SECRET is missing, too short, or uses a placeholder. ' +
        'Generate with: openssl rand -base64 48'
    );
  }
  if (media === jwt) {
    throw new Error(
      'Production startup blocked: MEDIA_SIGN_SECRET must differ from JWT_SECRET (separate signing domains).'
    );
  }
}

/**
 * Fail fast in production when JWT, session, CSRF, encryption, media signing, datastore,
 * and malware-scan env vars are missing, too short, or still set to documented placeholders.
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

  if (isInsecureSecret(process.env.REDIS_PASSWORD)) {
    failures.push('REDIS_PASSWORD');
  }

  if (isInsecureMinioCredential(process.env.MINIO_ACCESS_KEY)) {
    failures.push('MINIO_ACCESS_KEY');
  }
  if (isInsecureMinioCredential(process.env.MINIO_SECRET_KEY)) {
    failures.push('MINIO_SECRET_KEY');
  }

  if (failures.length > 0) {
    throw new Error(
      `Production startup blocked: insecure or missing secrets (${failures.join(', ')}). ` +
        'Generate values with: openssl rand -base64 48'
    );
  }

  assertMediaSignSecretDistinctFromJwt();
  assertProductionAppUrlHttps();
  assertProductionMongoUri();
  assertProductionMysqlAllowedHosts();
}

/** Cleartext APP_URL enables MITM theft of HttpOnly JWT cookies and Socket.io handshake tokens. */
function assertProductionAppUrlHttps(): void {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl == null || appUrl === '') {
    throw new Error(
      'Production startup blocked: APP_URL is required and must use https://. ' +
        'Terminate TLS at your reverse proxy and set APP_URL to the public HTTPS origin.',
    );
  }
  if (!appUrl.startsWith('https://')) {
    throw new Error(
      'Production startup blocked: APP_URL must use https:// (cleartext HTTP enables MITM on auth cookies and WebSockets).',
    );
  }
}

function assertProductionMysqlAllowedHosts(): void {
  const raw = process.env.MYSQL_ALLOWED_HOSTS?.trim();
  if (raw == null || raw === '') {
    throw new Error(
      'Production startup blocked: MYSQL_ALLOWED_HOSTS must list at least one external MySQL host. ' +
        'Example: MYSQL_ALLOWED_HOSTS=db.example.com'
    );
  }
}
