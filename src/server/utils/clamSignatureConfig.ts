import { parsePositiveInt } from './parseEnvInt.js';

export const DEFAULT_SIGNATURE_REFRESH_MS = 86_400_000;

/** Minimum interval between `freshclam` runs (also used by the scheduled refresh ticker). */
export function getSignatureRefreshIntervalMs(): number {
  return parsePositiveInt(process.env.POMPELMI_SIGNATURE_REFRESH_MS, DEFAULT_SIGNATURE_REFRESH_MS);
}
