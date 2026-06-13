import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BackupJob } from '../../models/BackupJob.js';
import { logger } from '../../utils/logger.js';

const activeBackupJobProcesses = new Map<string, ChildProcess>();

/** When true (default outside tests), each backup runs in `bun --smol` child process. */
export function shouldRunBackupInSmolSubprocess(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  const raw = process.env.BACKUP_JOB_SMOL_SUBPROCESS?.trim().toLowerCase();
  return raw !== 'false';
}

export function resolveBackupJobRunnerScriptPath(): string {
  const override = process.env.BACKUP_JOB_RUNNER_SCRIPT?.trim();
  if (override != null && override !== '') {
    return override;
  }
  const prod = join(process.cwd(), 'dist/workers/backupJobRunner.js');
  if (existsSync(prod)) {
    return prod;
  }
  return join(process.cwd(), 'src/server/workers/backupJobRunner.ts');
}

function pipeChildLogs(jobId: string, child: ChildProcess): void {
  child.stdout?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString().trim();
    if (text !== '') {
      logger.debug({ jobId, stream: 'stdout' }, text);
    }
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString().trim();
    if (text !== '') {
      logger.warn({ jobId, stream: 'stderr' }, text);
    }
  });
}

export function spawnBackupJobInSmolProcess(params: {
  readonly jobId: string;
  readonly userId: string;
  readonly ipAddress?: string | undefined;
}): void {
  const script = resolveBackupJobRunnerScriptPath();
  const args = ['--smol', 'run', script, params.jobId, params.userId];
  if (params.ipAddress != null && params.ipAddress !== '') {
    args.push(params.ipAddress);
  }
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeBackupJobProcesses.set(params.jobId, child);
  pipeChildLogs(params.jobId, child);
  child.on('error', (error) => {
    activeBackupJobProcesses.delete(params.jobId);
    logger.error({ error, jobId: params.jobId }, 'Backup subprocess failed to start');
    void BackupJob.findByIdAndUpdate(params.jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage: error instanceof Error ? error.message : String(error),
      progress: 0,
    });
  });
  child.on('exit', (code, signal) => {
    activeBackupJobProcesses.delete(params.jobId);
    if (signal != null) {
      logger.info({ jobId: params.jobId, signal }, 'Backup subprocess terminated');
      return;
    }
    if (code != null && code !== 0) {
      logger.warn({ jobId: params.jobId, exitCode: code }, 'Backup subprocess exited with error');
    }
  });
}

export function terminateBackupJobProcess(jobId: string): boolean {
  const child = activeBackupJobProcesses.get(jobId);
  if (child == null) {
    return false;
  }
  child.kill('SIGTERM');
  return true;
}
