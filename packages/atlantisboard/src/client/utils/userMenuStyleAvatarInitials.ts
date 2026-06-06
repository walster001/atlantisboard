/**
 * Matches `UserMenu`: first character of each whitespace-delimited name segment,
 * uppercased, at most two characters; otherwise the first letter of `fallbackWord`.
 */
export function userMenuStyleAvatarInitials(displayName: string, fallbackWord: string): string {
  const fromName = displayName
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!)
    .join('')
    .toUpperCase()
    .slice(0, 2);
  if (fromName.length > 0) {
    return fromName;
  }
  const f = fallbackWord.trim();
  return f.length > 0 ? f.charAt(0).toUpperCase() : '?';
}
