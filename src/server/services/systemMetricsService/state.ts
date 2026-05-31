export const SLOW_METRICS_REFRESH_MS = 15_000;

export let lastCpuSample: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage } = {
  wallMs: Date.now(),
  cpu: process.cpuUsage(),
};

export let lastIoSample:
  | {
      readonly wallMs: number;
      readonly diskReadBytes: number;
      readonly diskWriteBytes: number;
      readonly netRxBytes: number;
      readonly netTxBytes: number;
    }
  | undefined;

export let lastSlowMetricsSample:
  | ({
      readonly fetchedAt: number;
      readonly mongoVersion: string | null;
      readonly minioVersion: string | null;
      readonly disk?: { readonly totalMb: number; readonly usedMb: number };
      readonly databaseSizeMb?: number;
      readonly backupCount?: number;
      readonly hostTemperatureC?: number;
      readonly hostProcesses?: number;
      readonly dockerRunning?: number;
      readonly dockerTotal?: number;
      readonly dockerRunningContainers?: readonly string[];
    })
  | undefined;

export function setLastCpuSample(sample: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage }): void {
  lastCpuSample = sample;
}

export function setLastIoSample(
  sample:
    | {
        readonly wallMs: number;
        readonly diskReadBytes: number;
        readonly diskWriteBytes: number;
        readonly netRxBytes: number;
        readonly netTxBytes: number;
      }
    | undefined,
): void {
  lastIoSample = sample;
}

export function setLastSlowMetricsSample(
  sample: NonNullable<typeof lastSlowMetricsSample>,
): void {
  lastSlowMetricsSample = sample;
}
