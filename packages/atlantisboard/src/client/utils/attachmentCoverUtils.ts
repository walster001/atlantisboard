/** Extract the MinIO object path segment from a stored attachment or cover URL. */
export function extractObjectPath(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    return pathname.includes('/') ? pathname.split('/').slice(-2).join('/') : pathname;
  } catch {
    const withoutQuery = decodeURIComponent(trimmed.split('?')[0] ?? trimmed).replace(/^\/+/, '');
    return withoutQuery.includes('/') ? withoutQuery.split('/').slice(-2).join('/') : withoutQuery;
  }
}

/** Whether `imageUrl` refers to the same object as the card's current cover. */
export function isCoverAttachment(cover: string | undefined, imageUrl: string): boolean {
  if (typeof cover !== 'string' || cover.trim() === '') {
    return false;
  }
  return extractObjectPath(cover) === extractObjectPath(imageUrl);
}
