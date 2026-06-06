/** Internal login identity domain for import placeholders without a file email. */
export const IMPORT_PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.import.local';

export function isSyntheticImportPlaceholderEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${IMPORT_PLACEHOLDER_EMAIL_DOMAIN}`);
}

/**
 * Email shown in board settings for import placeholders: prefer the address from the import file,
 * never the synthetic account email used only for DB uniqueness.
 */
export function displayEmailForImportPlaceholderUser(params: {
  readonly placeholderEmail?: string | null | undefined;
  readonly accountEmail: string;
}): string {
  const fromImport = params.placeholderEmail?.trim();
  if (fromImport != null && fromImport !== '' && !isSyntheticImportPlaceholderEmail(fromImport)) {
    return fromImport;
  }
  const accountEmail = params.accountEmail.trim();
  if (isSyntheticImportPlaceholderEmail(accountEmail)) {
    return '';
  }
  return accountEmail;
}
