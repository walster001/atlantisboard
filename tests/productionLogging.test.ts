import { describe, it, expect, afterEach } from 'bun:test';
import { logAuditEvent } from '../src/server/utils/auditLogger.js';
import { logger, resolveLogLevel } from '../src/server/utils/logger.js';

describe('production logging', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('defaults to error in production when LOG_LEVEL is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;
    expect(resolveLogLevel()).toBe('error');
  });

  it('defaults to info in development when LOG_LEVEL is unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    expect(resolveLogLevel()).toBe('info');
  });

  it('honours explicit LOG_LEVEL when set', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'warn';
    expect(resolveLogLevel()).toBe('warn');
  });

  it('does not write audit events to stdout in production unless AUDIT_LOG_STDOUT is set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_LOG_STDOUT;
    let infoCalls = 0;
    const originalInfo = logger.info.bind(logger);
    logger.info = ((...args: Parameters<typeof logger.info>) => {
      infoCalls += 1;
      return originalInfo(...args);
    }) as typeof logger.info;

    try {
      logAuditEvent({
        userId: 'user-1',
        action: 'test.action',
        resourceType: 'test',
        timestamp: new Date(),
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(infoCalls).toBe(0);
    } finally {
      logger.info = originalInfo;
    }
  });
});

describe('deploy log cleanup helper', () => {
  it('cleanup_old_logs script exists and defines cleanup_old_logs', async () => {
    const scriptPath = `${import.meta.dir}/../scripts/lib/cleanup-old-logs.sh`;
    const content = await Bun.file(scriptPath).text();
    expect(content).toContain('cleanup_old_logs()');
    expect(content).toContain('mtime');
  });
});
