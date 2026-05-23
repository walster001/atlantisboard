import type { ImportPreflightUser } from './importPreflight.js';
import { normalizeImportSourceEmail } from './importSourceUserContact.js';

/** Fields used when inserting a {@link BoardImportPlaceholder} document (minus boardId/source). */
export interface BoardImportPlaceholderInsertFields {
  readonly sourceUserId: string;
  readonly displayName: string;
  readonly roleKey: string;
  readonly email?: string;
  readonly importUsername?: string;
}

export function buildBoardImportPlaceholderInsertFields(params: {
  readonly sourceUser: ImportPreflightUser;
  readonly roleKey: string;
}): BoardImportPlaceholderInsertFields {
  const { sourceUser, roleKey } = params;
  const email = normalizeImportSourceEmail(sourceUser.email);
  const importUsername =
    sourceUser.username != null && sourceUser.username.trim().length >= 3
      ? sourceUser.username.trim().toLowerCase()
      : undefined;
  const displayName =
    sourceUser.fullName?.trim() ||
    sourceUser.username?.trim() ||
    email?.split('@')[0] ||
    `Imported user ${sourceUser.sourceUserId.slice(0, 8)}`;

  return {
    sourceUserId: sourceUser.sourceUserId,
    displayName: displayName.slice(0, 100),
    roleKey,
    ...(email != null ? { email } : {}),
    ...(importUsername != null ? { importUsername } : {}),
  };
}
