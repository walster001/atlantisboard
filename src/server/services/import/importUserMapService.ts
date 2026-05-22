import { User } from '../../models/User.js';
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import type { ImportPreflightUser } from '../../../shared/import/importPreflight.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import { createImportPlaceholderUser } from '../importPlaceholderUserService.js';

async function autoMatchSourceUser(sourceUser: ImportPreflightUser): Promise<string | undefined> {
  const email = sourceUser.email?.trim();
  if (email != null && email.length > 0) {
    const byEmail = await User.findOne({ email: email.toLowerCase(), isPlaceholder: { $ne: true } });
    if (byEmail) {
      return byEmail._id.toString();
    }
  }
  const username = sourceUser.username?.trim();
  if (username != null && username.length >= 3) {
    const byUsername = await User.findOne({ username, isPlaceholder: { $ne: true } });
    if (byUsername) {
      return byUsername._id.toString();
    }
  }
  const fullName = sourceUser.fullName?.trim();
  if (fullName != null && fullName.length > 0) {
    const byName = await User.findOne({ displayName: fullName, isPlaceholder: { $ne: true } });
    if (byName) {
      return byName._id.toString();
    }
  }
  return undefined;
}

/**
 * Maps Wekan/Trello source user ids to Atlantis user ids (existing accounts or import placeholders).
 */
export async function buildImportSourceUserMap(params: {
  readonly sourceUsers: readonly ImportPreflightUser[];
  readonly source: 'trello' | 'wekan';
  readonly importerUserId: string;
  readonly preflight?: ImportPreflightPayloadParsed | undefined;
}): Promise<Map<string, string>> {
  const { sourceUsers, source, importerUserId, preflight } = params;
  const policy = preflight?.unmappedUserPolicy ?? 'discard_unmapped';
  const decisionsBySource = new Map(
    (preflight?.userDecisions ?? []).map((d) => [d.sourceUserId, d] as const),
  );

  const userMap = new Map<string, string>();
  for (const sourceUser of sourceUsers) {
    const autoMatchedUserId = await autoMatchSourceUser(sourceUser);
    const decision = decisionsBySource.get(sourceUser.sourceUserId);
    const resolution = resolveImportUserResolution({
      ...(decision !== undefined ? { decision } : {}),
      ...(autoMatchedUserId !== undefined ? { autoMatchedUserId } : {}),
      policy,
      importerUserId,
    });

    switch (resolution.kind) {
      case 'map':
        userMap.set(sourceUser.sourceUserId, resolution.userId);
        break;
      case 'discard':
        break;
      case 'create_placeholder': {
        const placeholderId = await createImportPlaceholderUser({ source, sourceUser });
        userMap.set(sourceUser.sourceUserId, placeholderId);
        break;
      }
    }
  }
  return userMap;
}
