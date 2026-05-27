import { describe, expect, it, afterEach } from 'bun:test';
import { buildSmtpTlsOptions } from '../src/server/services/emailService.js';

describe('buildSmtpTlsOptions', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('enables certificate verification by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_TLS_INSECURE;
    const tls = buildSmtpTlsOptions();
    expect(tls.rejectUnauthorized).toBe(true);
    expect(tls.checkServerIdentity).toBeUndefined();
  });

  it('allows insecure TLS only in non-production when SMTP_TLS_INSECURE=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.SMTP_TLS_INSECURE = 'true';
    const tls = buildSmtpTlsOptions();
    expect(tls.rejectUnauthorized).toBe(false);
    expect(typeof tls.checkServerIdentity).toBe('function');
  });

  it('ignores SMTP_TLS_INSECURE in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_TLS_INSECURE = 'true';
    const tls = buildSmtpTlsOptions();
    expect(tls.rejectUnauthorized).toBe(true);
  });
});
