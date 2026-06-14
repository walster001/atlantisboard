import { describe, it, expect, afterEach } from 'bun:test';
import {
  assertProductionSecrets,
  mongoUriHasCredentials,
} from '../src/server/utils/productionSecrets.js';

describe('mongoUriHasCredentials', () => {
  it('returns true when username and password are present', () => {
    expect(
      mongoUriHasCredentials(
        'mongodb://kanboard_app:test-db-password-not-real@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0',
      ),
    ).toBe(true);
  });

  it('returns false when credentials are missing', () => {
    expect(mongoUriHasCredentials('mongodb://mongodb:27017/kanboard')).toBe(false);
  });
});

describe('assertProductionSecrets', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setSecureProductionSecrets(): void {
    const secure = 'a'.repeat(48);
    const media = 'b'.repeat(48);
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://boards.example.com';
    process.env.JWT_SECRET = secure;
    process.env.SESSION_SECRET = secure;
    process.env.CSRF_SECRET = secure;
    process.env.ENCRYPTION_KEY = secure;
    process.env.MEDIA_SIGN_SECRET = media;
    process.env.REDIS_PASSWORD = secure;
    process.env.MINIO_ACCESS_KEY = secure;
    process.env.MINIO_SECRET_KEY = secure;
    process.env.MONGODB_URI =
      'mongodb://kanboard_app:test-db-password-not-real@mongodb:27017/kanboard?authSource=kanboard&replicaSet=rs0';
    process.env.MYSQL_ALLOWED_HOSTS = 'db.example.com';
    delete process.env.POMPELMI_SKIP_SCAN;
  }

  it('does nothing outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'short';
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('throws when production secrets are missing or insecure', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'your-secret-key-change-in-production';
    process.env.SESSION_SECRET = 'your-session-secret-change-in-production';
    process.env.CSRF_SECRET = 'change-this-csrf-secret-in-production';
    process.env.ENCRYPTION_KEY = 'change-this-to-a-secure-random-string-in-production';

    expect(() => assertProductionSecrets()).toThrow(/Production startup blocked/);
  });

  it('accepts secrets that meet minimum length and are not placeholders', () => {
    setSecureProductionSecrets();
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('blocks POMPELMI_SKIP_SCAN in production', () => {
    setSecureProductionSecrets();
    process.env.POMPELMI_SKIP_SCAN = 'true';
    expect(() => assertProductionSecrets()).toThrow(/POMPELMI_SKIP_SCAN/);
  });

  it('blocks default MinIO credentials in production', () => {
    setSecureProductionSecrets();
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    expect(() => assertProductionSecrets()).toThrow(/MINIO_ACCESS_KEY/);
  });

  it('blocks MongoDB URI without credentials in production', () => {
    setSecureProductionSecrets();
    process.env.MONGODB_URI = 'mongodb://mongodb:27017/kanboard?replicaSet=rs0';
    expect(() => assertProductionSecrets()).toThrow(/MONGODB_URI must include credentials/);
  });

  it('blocks MEDIA_SIGN_SECRET equal to JWT_SECRET in production', () => {
    setSecureProductionSecrets();
    process.env.MEDIA_SIGN_SECRET = process.env.JWT_SECRET;
    expect(() => assertProductionSecrets()).toThrow(/MEDIA_SIGN_SECRET must differ/);
  });

  it('blocks missing MYSQL_ALLOWED_HOSTS in production', () => {
    setSecureProductionSecrets();
    delete process.env.MYSQL_ALLOWED_HOSTS;
    expect(() => assertProductionSecrets()).toThrow(/MYSQL_ALLOWED_HOSTS must list at least one external MySQL host/);
  });

  it('accepts MYSQL_ALLOWED_HOSTS in production', () => {
    setSecureProductionSecrets();
    process.env.MYSQL_ALLOWED_HOSTS = 'db.example.com';
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('blocks cleartext APP_URL in production', () => {
    setSecureProductionSecrets();
    process.env.APP_URL = 'http://boards.example.com';
    expect(() => assertProductionSecrets()).toThrow(/APP_URL must use https:\/\//);
  });

  it('blocks missing APP_URL in production', () => {
    setSecureProductionSecrets();
    delete process.env.APP_URL;
    expect(() => assertProductionSecrets()).toThrow(/APP_URL is required/);
  });
});
