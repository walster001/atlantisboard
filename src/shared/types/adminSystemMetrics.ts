/** JSON returned by `GET /api/v1/admin/system/metrics` (app admin only). */
export interface AdminSystemMetricsSnapshot {
  readonly timestamp: string;
  readonly host: {
    readonly hostname: string;
    readonly os: string;
    readonly kernel: string;
    readonly processor: string;
    readonly temperatureC?: number;
    readonly processes?: number;
  };
  readonly process: {
    readonly rssMb: number;
    readonly heapUsedMb: number;
    readonly heapTotalMb: number;
    readonly externalMb: number;
    /** Approximate average CPU cores used by this process since the previous sample. */
    readonly cpuCoresApprox: number;
    /** Same metric as a percentage of all logical CPUs (0–100+). */
    readonly cpuPercentOfSystem: number;
  };
  /** Host memory is only populated on Linux (`/proc/meminfo`). Load averages are always OS-level when present. */
  readonly system?: {
    readonly memTotalMb?: number;
    readonly memAvailableMb?: number;
    readonly diskTotalMb?: number;
    readonly diskUsedMb?: number;
    readonly diskReadBytesPerSec?: number;
    readonly diskWriteBytesPerSec?: number;
    readonly networkRxBytesPerSec?: number;
    readonly networkTxBytesPerSec?: number;
    readonly load1m: number;
    readonly load5m: number;
  };
  readonly runtime: {
    readonly uptimeSec: number;
    readonly databaseSizeMb?: number;
    readonly dockerRunning?: number;
    readonly dockerTotal?: number;
    readonly dockerRunningContainers?: readonly string[];
    readonly backupCount?: number;
  };
  readonly versions: {
    readonly app: string;
    readonly node: string;
    readonly bun: string | null;
    readonly mongodb: string | null;
    readonly minio: string | null;
  };
}
