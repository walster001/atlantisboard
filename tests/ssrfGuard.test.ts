import { describe, expect, test } from 'bun:test';
import { assertMysqlHostAllowed } from '../src/server/utils/ssrfGuard.js';

describe('assertMysqlHostAllowed', () => {
  test('rejects metadata IP 169.254.169.254', async () => {
    await expect(assertMysqlHostAllowed('169.254.169.254')).rejects.toThrow(
      'blocked private or metadata IP range',
    );
  });

  test('rejects localhost', async () => {
    await expect(assertMysqlHostAllowed('127.0.0.1')).rejects.toThrow(
      'blocked private or metadata IP range',
    );
  });

  test('rejects host not in MYSQL_ALLOWED_HOSTS when allowlist is set', async () => {
    const previous = process.env.MYSQL_ALLOWED_HOSTS;
    process.env.MYSQL_ALLOWED_HOSTS = 'db.example.com';
    try {
      await expect(assertMysqlHostAllowed('evil.internal')).rejects.toThrow(
        'MySQL host is not in MYSQL_ALLOWED_HOSTS',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.MYSQL_ALLOWED_HOSTS;
      } else {
        process.env.MYSQL_ALLOWED_HOSTS = previous;
      }
    }
  });

  test('allows host in MYSQL_ALLOWED_HOSTS even if it would otherwise resolve privately', async () => {
    const previous = process.env.MYSQL_ALLOWED_HOSTS;
    process.env.MYSQL_ALLOWED_HOSTS = '127.0.0.1';
    try {
      await expect(assertMysqlHostAllowed('127.0.0.1')).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.MYSQL_ALLOWED_HOSTS;
      } else {
        process.env.MYSQL_ALLOWED_HOSTS = previous;
      }
    }
  });
});
