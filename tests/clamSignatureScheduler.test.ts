import { describe, it, expect, afterEach } from 'bun:test';
import { getSignatureRefreshIntervalMs } from '../src/server/utils/clamSignatureConfig.js';
import {
  isSignatureRefreshSchedulerEnabled,
  startClamSignatureRefreshScheduler,
  stopClamSignatureRefreshSchedulerForTests,
} from '../src/server/utils/clamSignatureScheduler.js';

describe('clamSignatureScheduler', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    stopClamSignatureRefreshSchedulerForTests();
  });

  it('defaults refresh interval to 24 hours', () => {
    delete process.env.POMPELMI_SIGNATURE_REFRESH_MS;
    expect(getSignatureRefreshIntervalMs()).toBe(86_400_000);
  });

  it('parses POMPELMI_SIGNATURE_REFRESH_MS', () => {
    process.env.POMPELMI_SIGNATURE_REFRESH_MS = '3600000';
    expect(getSignatureRefreshIntervalMs()).toBe(3_600_000);
  });

  it('falls back when POMPELMI_SIGNATURE_REFRESH_MS is invalid', () => {
    process.env.POMPELMI_SIGNATURE_REFRESH_MS = 'not-a-number';
    expect(getSignatureRefreshIntervalMs()).toBe(86_400_000);
  });

  it('is enabled by default', () => {
    delete process.env.POMPELMI_SIGNATURE_REFRESH;
    expect(isSignatureRefreshSchedulerEnabled()).toBe(true);
  });

  it('can be disabled with POMPELMI_SIGNATURE_REFRESH=false', () => {
    process.env.POMPELMI_SIGNATURE_REFRESH = 'false';
    expect(isSignatureRefreshSchedulerEnabled()).toBe(false);
  });

  it('does not start scheduler when scan is skipped', () => {
    process.env.POMPELMI_SKIP_SCAN = 'true';
    process.env.NODE_ENV = 'production';

    startClamSignatureRefreshScheduler();
    startClamSignatureRefreshScheduler();

    expect(stopClamSignatureRefreshSchedulerForTests()).toBeUndefined();
  });

  it('does not start scheduler in test NODE_ENV', () => {
    process.env.POMPELMI_SKIP_SCAN = 'false';
    process.env.NODE_ENV = 'test';

    startClamSignatureRefreshScheduler();
    startClamSignatureRefreshScheduler();

    expect(stopClamSignatureRefreshSchedulerForTests()).toBeUndefined();
  });
});
