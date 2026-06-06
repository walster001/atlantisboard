import { existsSync, readFileSync } from 'node:fs';
import type { ConnectionOptions as TlsConnectionOptions } from 'node:tls';

export type RedisHostPort = Readonly<{ host: string; port: number }>;

export function envTruthy(value: string | undefined): boolean {
  if (value == null || value.trim() === '') {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getRedisPassword(): string | undefined {
  const p = process.env.REDIS_PASSWORD?.trim();
  return p !== undefined && p !== '' ? p : undefined;
}

export function getRedisUsername(): string | undefined {
  const u = process.env.REDIS_USERNAME?.trim();
  return u !== undefined && u !== '' ? u : undefined;
}

export function getRedisStandalonePort(): number {
  const n = Number(process.env.REDIS_PORT);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? Math.floor(n) : 6379;
}

export function getRedisHost(): string {
  const h = process.env.REDIS_HOST?.trim();
  return h !== undefined && h !== '' ? h : 'localhost';
}

export function isRedisTlsEnabled(): boolean {
  return envTruthy(process.env.REDIS_TLS);
}

/** When TLS is on, defaults to verifying server cert unless explicitly disabled (not recommended in production). */
export function redisTlsRejectUnauthorized(): boolean {
  const raw = process.env.REDIS_TLS_REJECT_UNAUTHORIZED?.trim();
  if (raw === undefined || raw === '') {
    return true;
  }
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no' || raw.toLowerCase() === 'off') {
    return false;
  }
  return envTruthy(raw) || raw.toLowerCase() === 'true';
}

let tlsCaFileMemo: Buffer | undefined | false = false;

/** PEM CA from `REDIS_TLS_CA_PATH` (read once; safe for many cluster root nodes). */
export function readRedisTlsCaFromEnv(): Buffer | undefined {
  if (tlsCaFileMemo !== false) {
    return tlsCaFileMemo;
  }
  const caPath = process.env.REDIS_TLS_CA_PATH?.trim();
  if (caPath === undefined || caPath === '' || !existsSync(caPath)) {
    tlsCaFileMemo = undefined;
    return undefined;
  }
  tlsCaFileMemo = readFileSync(caPath);
  return tlsCaFileMemo;
}

export function buildIoredisTlsOptions(): TlsConnectionOptions | undefined {
  if (!isRedisTlsEnabled()) {
    return undefined;
  }
  const rejectUnauthorized = redisTlsRejectUnauthorized();
  const ca = readRedisTlsCaFromEnv();
  if (ca !== undefined) {
    return { rejectUnauthorized, ca };
  }
  return { rejectUnauthorized };
}

export function isRedisClusterMode(): boolean {
  return envTruthy(process.env.REDIS_CLUSTER);
}

/**
 * Comma-separated `host:port` or `host` (uses `defaultPort`).
 * IPv6: `[::1]:6379`.
 */
export function parseRedisClusterNodes(raw: string | undefined, defaultPort: number): readonly RedisHostPort[] {
  if (raw == null || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((entry) => parseHostPort(entry, defaultPort));
}

function parseHostPort(entry: string, defaultPort: number): RedisHostPort {
  const e = entry.trim();
  if (e.startsWith('[')) {
    const close = e.indexOf(']');
    if (close > 1) {
      const hostInner = e.slice(1, close);
      const rest = e.slice(close + 1).trim();
      if (rest.startsWith(':')) {
        const port = Number.parseInt(rest.slice(1), 10);
        if (Number.isFinite(port) && port > 0 && port <= 65535) {
          return { host: hostInner, port };
        }
      }
      return { host: hostInner, port: defaultPort };
    }
  }
  const lastColon = e.lastIndexOf(':');
  if (lastColon <= 0 || lastColon === e.length - 1) {
    return { host: e, port: defaultPort };
  }
  const hostPart = e.slice(0, lastColon).trim();
  const portPart = e.slice(lastColon + 1).trim();
  const port = Number.parseInt(portPart, 10);
  if (Number.isFinite(port) && port > 0 && port <= 65535) {
    return { host: hostPart, port };
  }
  return { host: e, port: defaultPort };
}

/** If `REDIS_CLUSTER_NODES` is empty, uses `REDIS_HOST`:`REDIS_PORT` as the sole discovery node. */
export function resolveClusterStartupNodes(standaloneHost: string, standalonePort: number): readonly RedisHostPort[] {
  const fromEnv = parseRedisClusterNodes(process.env.REDIS_CLUSTER_NODES, standalonePort);
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  return [{ host: standaloneHost, port: standalonePort }];
}

export function redisClusterUseReplicas(): boolean {
  return envTruthy(process.env.REDIS_CLUSTER_USE_REPLICAS);
}
