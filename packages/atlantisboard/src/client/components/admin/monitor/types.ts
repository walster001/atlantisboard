export interface MonitorPoint {
  readonly t: string;
  readonly ts: number;
  readonly cpuPercent: number;
  readonly memoryUsedPercent: number;
  readonly diskUsedPercent: number;
  readonly hostMemUsedPercent: number;
}

export interface RuntimeSummary {
  readonly cpu: number;
  readonly memory: number;
  readonly disk: number;
}

export interface RecentActivityRow {
  readonly id: string;
  readonly event: string;
  readonly time: string;
  readonly cpu: number;
  readonly mem: number;
  readonly disk: number;
}
