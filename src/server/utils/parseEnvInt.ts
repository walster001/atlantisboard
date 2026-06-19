export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePositiveIntEnv(name: string, fallback: number): number {
  return parsePositiveInt(process.env[name], fallback);
}
