import os from 'node:os';
import { parsePositiveInt } from '../../utils/parseEnvInt.js';

/** Default minimum vCPU count before upload-time ABR packaging runs. */
export const VIDEO_ABR_MIN_VCPU_DEFAULT = 4;

let cachedEligible: boolean | null = null;

function readMinVcpu(): number {
  return parsePositiveInt(process.env.VIDEO_ABR_MIN_VCPU, VIDEO_ABR_MIN_VCPU_DEFAULT);
}

/** Test-only reset for eligibility cache. */
export function resetVideoAbrEligibilityCacheForTests(): void {
  cachedEligible = null;
}

/**
 * Whether this process should schedule or serve ABR renditions.
 * ponytail: `os.cpus().length` vs min vCPU; override with VIDEO_ABR_ENABLED or VIDEO_ABR_MIN_VCPU.
 */
export function isVideoAbrEligible(): boolean {
  if (cachedEligible != null) {
    return cachedEligible;
  }
  const forced = process.env.VIDEO_ABR_ENABLED?.trim().toLowerCase();
  if (forced === 'false' || forced === '0') {
    cachedEligible = false;
    return false;
  }
  if (forced === 'true' || forced === '1') {
    cachedEligible = true;
    return true;
  }
  cachedEligible = os.cpus().length >= readMinVcpu();
  return cachedEligible;
}
