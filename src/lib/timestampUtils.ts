/**
 * Timestamp normalization utilities for conflict resolution
 * 
 * All timestamps are normalized to local machine time (milliseconds)
 * to ensure consistent comparison across different formats and timezones.
 */

/**
 * Normalizes a timestamp to local machine time in milliseconds
 * Handles ISO strings, Date objects, and millisecond numbers
 */
export function normalizeTimestamp(timestamp: string | Date | number | null | undefined): number {
  if (timestamp === null || timestamp === undefined) {
    return 0;
  }

  if (typeof timestamp === 'number') {
    // If it's already a number, assume it's milliseconds
    // If it's less than 1e12, it might be seconds, so convert
    if (timestamp < 1e12) {
      return timestamp * 1000;
    }
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp === 'string') {
    // Try parsing as ISO string
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
    // Try parsing as number string
    const num = Number(timestamp);
    if (!isNaN(num)) {
      return normalizeTimestamp(num);
    }
  }

  // Fallback: return 0 for invalid timestamps
  console.warn('[timestampUtils] Invalid timestamp format:', timestamp);
  return 0;
}

/**
 * Compares two timestamps and returns:
 * - -1 if a is older than b
 * - 0 if a equals b
 * - 1 if a is newer than b
 */
export function compareTimestamps(
  a: string | Date | number | null | undefined,
  b: string | Date | number | null | undefined
): number {
  const normalizedA = normalizeTimestamp(a);
  const normalizedB = normalizeTimestamp(b);

  if (normalizedA < normalizedB) return -1;
  if (normalizedA > normalizedB) return 1;
  return 0;
}

/**
 * Checks if timestamp a is newer than timestamp b
 */
export function isNewer(a: string | Date | number | null | undefined, b: string | Date | number | null | undefined): boolean {
  return compareTimestamps(a, b) > 0;
}

/**
 * Checks if timestamp a is older than timestamp b
 */
export function isOlder(a: string | Date | number | null | undefined, b: string | Date | number | null | undefined): boolean {
  return compareTimestamps(a, b) < 0;
}

/**
 * Checks if two timestamps are equal (within 1ms tolerance for floating point issues)
 */
export function isEqual(a: string | Date | number | null | undefined, b: string | Date | number | null | undefined): boolean {
  const normalizedA = normalizeTimestamp(a);
  const normalizedB = normalizeTimestamp(b);
  return Math.abs(normalizedA - normalizedB) < 1;
}

