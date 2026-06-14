/** Minimum free disk space kept for MongoDB, uploads, and other writes (default 500 MiB). */
export const DISK_RESERVE_DEFAULT_MB = 500;

export type DiskReserveEnv = {
  readonly DISK_RESERVE_MB?: string | undefined;
};

export function resolveDiskReserveBytes(env: DiskReserveEnv): number {
  const parsed = Number.parseInt(env.DISK_RESERVE_MB ?? '', 10);
  const mb = Number.isFinite(parsed) && parsed >= 0 ? parsed : DISK_RESERVE_DEFAULT_MB;
  return mb * 1024 * 1024;
}

export function getDiskReserveBytes(): number {
  return resolveDiskReserveBytes({ DISK_RESERVE_MB: process.env.DISK_RESERVE_MB });
}

export function formatDiskReserveMb(reserveBytes: number): number {
  return Math.max(1, Math.round(reserveBytes / (1024 * 1024)));
}
