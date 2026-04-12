/**
 * Attachments created by imports (e.g. Trello) may be metadata-only until a file is uploaded to storage.
 */
export function isPlaceholderCardAttachment(att: {
  readonly isPlaceholder?: boolean;
  readonly url?: string;
}): boolean {
  if (att.isPlaceholder === true) {
    return true;
  }
  return typeof att.url === 'string' && att.url.trim().length === 0;
}
