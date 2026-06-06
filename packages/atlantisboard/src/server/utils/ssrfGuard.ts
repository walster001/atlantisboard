import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

function parseAllowedHostsEnv(): ReadonlySet<string> | null {
  const raw = process.env.MYSQL_ALLOWED_HOSTS?.trim();
  if (raw == null || raw === '') {
    return null;
  }
  const hosts = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return hosts.length > 0 ? new Set(hosts) : null;
}

function isPrivateOrMetadataIp(ip: string): boolean {
  if (net.isIP(ip) === 0) {
    return true;
  }
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
    return true;
  }
  if (ip.startsWith('127.')) {
    return true;
  }
  if (ip.startsWith('10.')) {
    return true;
  }
  if (ip.startsWith('192.168.')) {
    return true;
  }
  if (ip.startsWith('169.254.')) {
    return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  if (ip.startsWith('fe80:')) {
    return true;
  }
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length === 4 && parts[0] === 172 && parts[1] != null && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  return false;
}

export async function assertMysqlHostAllowed(host: string): Promise<void> {
  const trimmed = host.trim();
  if (trimmed === '') {
    throw new Error('MySQL host is required');
  }

  const allowlist = parseAllowedHostsEnv();
  if (allowlist != null) {
    if (!allowlist.has(trimmed.toLowerCase())) {
      throw new Error('MySQL host is not in MYSQL_ALLOWED_HOSTS');
    }
    return;
  }

  if (net.isIP(trimmed) !== 0) {
    if (isPrivateOrMetadataIp(trimmed)) {
      throw new Error('MySQL host resolves to a blocked private or metadata IP range');
    }
    return;
  }

  let addresses: string[];
  try {
    const result = await dnsLookup(trimmed, { all: true });
    addresses = result.map((entry) => entry.address);
  } catch {
    throw new Error('MySQL host could not be resolved');
  }

  if (addresses.length === 0) {
    throw new Error('MySQL host could not be resolved');
  }

  for (const address of addresses) {
    if (isPrivateOrMetadataIp(address)) {
      throw new Error('MySQL host resolves to a blocked private or metadata IP range');
    }
  }
}
