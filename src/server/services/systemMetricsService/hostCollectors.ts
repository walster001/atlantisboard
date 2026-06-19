import { readFileSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { metricsCache } from './state.js';

const execFileAsync = promisify(execFile);

export function readLinuxMeminfoMb(): { memTotalMb: number; memAvailableMb: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/meminfo', 'utf8');
    let totalKb = 0;
    let availKb = 0;
    for (const line of text.split('\n')) {
      if (line.startsWith('MemTotal:')) {
        const m = /MemTotal:\s+(\d+)\s+kB/i.exec(line);
        if (m) totalKb = Number(m[1]);
      } else if (line.startsWith('MemAvailable:')) {
        const m = /MemAvailable:\s+(\d+)\s+kB/i.exec(line);
        if (m) availKb = Number(m[1]);
      }
    }
    if (totalKb <= 0 || availKb <= 0) {
      return undefined;
    }
    return { memTotalMb: totalKb / 1024, memAvailableMb: availKb / 1024 };
  } catch {
    return undefined;
  }
}

export function sampleProcessCpu(): { cpuCoresApprox: number; cpuPercentOfSystem: number } {
  const nowWall = Date.now();
  const wallMs = Math.max(1, nowWall - metricsCache.lastCpuSample.wallMs);
  const delta = process.cpuUsage(metricsCache.lastCpuSample.cpu);
  metricsCache.lastCpuSample = { wallMs: nowWall, cpu: process.cpuUsage() };
  const cpuMicros = delta.user + delta.system;
  const cpuSec = cpuMicros / 1e6;
  const wallSec = wallMs / 1000;
  const cores = wallSec > 0 ? cpuSec / wallSec : 0;
  const logical = Math.max(1, os.cpus().length);
  const cpuPercentOfSystem = (cores / logical) * 100;
  return { cpuCoresApprox: cores, cpuPercentOfSystem };
}

export function readHostTemperatureC(): number | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  const candidates = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/hwmon/hwmon0/temp1_input',
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf8').trim();
      const milli = Number(raw);
      if (Number.isFinite(milli) && milli > 0) {
        return milli / 1000;
      }
    } catch {
      // Try next source.
    }
  }
  return undefined;
}

export function readProcessCountLinux(): number | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const entries = readdirSync('/proc', { withFileTypes: true });
    let count = 0;
    for (const ent of entries) {
      if (ent.isDirectory() && /^[0-9]+$/.test(ent.name)) {
        count += 1;
      }
    }
    return count;
  } catch {
    return undefined;
  }
}

function parseDfTotalsMb(stdout: string): { totalMb: number; usedMb: number } | undefined {
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) {
    return undefined;
  }
  const cols = lines[1]!.split(/\s+/);
  const totalKb = Number(cols[1]);
  const usedKb = Number(cols[2]);
  if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb) || totalKb <= 0 || usedKb < 0) {
    return undefined;
  }
  return { totalMb: totalKb / 1024, usedMb: usedKb / 1024 };
}

export async function readDiskTotalsMb(): Promise<{ totalMb: number; usedMb: number } | undefined> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '/']);
    return parseDfTotalsMb(stdout);
  } catch {
    return undefined;
  }
}

export async function readDiskTotalsMbForPath(
  mountPath: string,
): Promise<{ totalMb: number; usedMb: number } | undefined> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', mountPath]);
    return parseDfTotalsMb(stdout);
  } catch {
    return undefined;
  }
}

export function getClamAvDbDirForMetrics(): string {
  const configured = process.env.CLAMAV_DB_DIR?.trim();
  return configured != null && configured !== '' ? configured : '/var/lib/clamav';
}

function readLinuxDiskIoBytes(): { readBytes: number; writeBytes: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/diskstats', 'utf8');
    let readSectors = 0;
    let writeSectors = 0;
    for (const line of text.split('\n')) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 14) {
        continue;
      }
      const name = cols[2] ?? '';
      if (!/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/.test(name)) {
        continue;
      }
      readSectors += Number(cols[5] ?? 0);
      writeSectors += Number(cols[9] ?? 0);
    }
    return {
      readBytes: readSectors * 512,
      writeBytes: writeSectors * 512,
    };
  } catch {
    return undefined;
  }
}

function readLinuxNetworkIoBytes(): { rxBytes: number; txBytes: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const parts = line.trim().split(/[:\s]+/).filter((p) => p !== '');
      if (parts.length < 17) {
        continue;
      }
      const iface = parts[0] ?? '';
      if (iface === 'lo') {
        continue;
      }
      rx += Number(parts[1] ?? 0);
      tx += Number(parts[9] ?? 0);
    }
    return { rxBytes: rx, txBytes: tx };
  } catch {
    return undefined;
  }
}

export function sampleLinuxIoRates(): {
  diskReadBytesPerSec?: number;
  diskWriteBytesPerSec?: number;
  networkRxBytesPerSec?: number;
  networkTxBytesPerSec?: number;
} {
  const disk = readLinuxDiskIoBytes();
  const net = readLinuxNetworkIoBytes();
  const nowMs = Date.now();
  const sample = {
    wallMs: nowMs,
    diskReadBytes: disk?.readBytes ?? 0,
    diskWriteBytes: disk?.writeBytes ?? 0,
    netRxBytes: net?.rxBytes ?? 0,
    netTxBytes: net?.txBytes ?? 0,
  };
  const prev = metricsCache.lastIoSample;
  metricsCache.lastIoSample = sample;
  if (prev == null) {
    return {};
  }
  const dt = Math.max(1, (sample.wallMs - prev.wallMs) / 1000);
  return {
    diskReadBytesPerSec: Math.max(0, (sample.diskReadBytes - prev.diskReadBytes) / dt),
    diskWriteBytesPerSec: Math.max(0, (sample.diskWriteBytes - prev.diskWriteBytes) / dt),
    networkRxBytesPerSec: Math.max(0, (sample.netRxBytes - prev.netRxBytes) / dt),
    networkTxBytesPerSec: Math.max(0, (sample.netTxBytes - prev.netTxBytes) / dt),
  };
}
