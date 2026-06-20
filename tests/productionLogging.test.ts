import { describe, it, expect, afterEach } from 'bun:test';
import { logAuditEvent } from '../src/server/utils/auditLogger.js';
import { logger } from '../src/server/utils/logger.js';

describe('production logging', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
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
