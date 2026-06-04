/** Parse sprite grid coords from editor attrs (numbers) or JSON round-trips (strings). */
export function parseTwemojiSpriteCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}
