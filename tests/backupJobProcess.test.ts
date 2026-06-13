import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveBackupJobRunnerScriptPath,
  shouldRunBackupInSmolSubprocess,
} from '../src/server/services/backupService/backupJobProcess.js';

describe('backupJobProcess', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('shouldRunBackupInSmolSubprocess', () => {
    it('is disabled in test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(shouldRunBackupInSmolSubprocess()).toBe(false);
    });

    it('is enabled by default in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.BACKUP_JOB_SMOL_SUBPROCESS;
      expect(shouldRunBackupInSmolSubprocess()).toBe(true);
    });

    it('can be disabled with BACKUP_JOB_SMOL_SUBPROCESS=false', () => {
      process.env.NODE_ENV = 'production';
      process.env.BACKUP_JOB_SMOL_SUBPROCESS = 'false';
      expect(shouldRunBackupInSmolSubprocess()).toBe(false);
    });
  });

  describe('resolveBackupJobRunnerScriptPath', () => {
    it('prefers dist/workers/backupJobRunner.js when present', () => {
      const prod = join(process.cwd(), 'dist/workers/backupJobRunner.js');
      if (existsSync(prod)) {
        expect(resolveBackupJobRunnerScriptPath()).toBe(prod);
        return;
      }
      expect(resolveBackupJobRunnerScriptPath()).toBe(
        join(process.cwd(), 'src/server/workers/backupJobRunner.ts'),
      );
    });

    it('honours BACKUP_JOB_RUNNER_SCRIPT override', () => {
      process.env.BACKUP_JOB_RUNNER_SCRIPT = '/tmp/custom-backup-runner.js';
      expect(resolveBackupJobRunnerScriptPath()).toBe('/tmp/custom-backup-runner.js');
    });
  });
});
