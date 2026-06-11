export const DEFAULT_SIGNATURE_REFRESH_MS = 86_400_000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Minimum interval between `freshclam` runs (also used by the scheduled refresh ticker). */
export function getSignatureRefreshIntervalMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SIGNATURE_REFRESH_MS, DEFAULT_SIGNATURE_REFRESH_MS);
}
