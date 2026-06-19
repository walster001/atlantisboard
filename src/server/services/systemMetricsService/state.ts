export const SLOW_METRICS_REFRESH_MS = 15_000;

export type CpuSample = { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage };

export type IoSample = {
  readonly wallMs: number;
  readonly diskReadBytes: number;
  readonly diskWriteBytes: number;
  readonly netRxBytes: number;
  readonly netTxBytes: number;
};

export type SlowMetricsSample = {
  readonly fetchedAt: number;
  readonly mongoVersion: string | null;
  readonly minioVersion: string | null;
  readonly disk?: { readonly totalMb: number; readonly usedMb: number };
  readonly clamavDisk?: { readonly totalMb: number; readonly usedMb: number };
  readonly databaseSizeMb?: number;
  readonly backupCount?: number;
  readonly hostTemperatureC?: number;
  readonly hostProcesses?: number;
  readonly dockerRunning?: number;
  readonly dockerTotal?: number;
  readonly dockerRunningContainers?: readonly string[];
};

export const metricsCache = {
  lastCpuSample: {
    wallMs: Date.now(),
    cpu: process.cpuUsage(),
  } satisfies CpuSample,
  lastIoSample: undefined as IoSample | undefined,
  lastSlowMetricsSample: undefined as SlowMetricsSample | undefined,
};
