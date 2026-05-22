import type { UnmappedUserPolicy } from '../../../shared/import/importPreflight.js';
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import type { ImportPreflightUser } from '../../../shared/import/importPreflight.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import { User } from '../../models/User.js';
import { stubImportPreflightUser } from './importSourceUserCatalog.js';
import { getOrCreateBoardImportPlaceholder, isBoardImportPlaceholderId } from '../boardImportPlaceholderService.js';

async function autoMatchSourceUser(sourceUser: ImportPreflightUser): Promise<string | undefined> {
  const email = sourceUser.email?.trim();
  if (email != null && email.length > 0) {
    const byEmail = await User.findOne({ email: email.toLowerCase() });
    if (byEmail) {
      return byEmail._id.toString();
    }
  }
  const username = sourceUser.username?.trim();
  if (username != null && username.length >= 3) {
    const byUsername = await User.findOne({ username });
    if (byUsername) {
      return byUsername._id.toString();
    }
  }
  return undefined;
}

/**
 * Maps import file user ids to existing registered User ids (auto-match only).
 */
export async function buildImportRealUserMap(
  sourceUsers: readonly ImportPreflightUser[],
): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();
  for (const sourceUser of sourceUsers) {
    const autoMatchedUserId = await autoMatchSourceUser(sourceUser);
    if (autoMatchedUserId != null) {
      userMap.set(sourceUser.sourceUserId, autoMatchedUserId);
    }
  }
  return userMap;
}

/**
 * Resolves a source user id to a real User id or a board-scoped import placeholder id.
 */
export async function resolveImportActorId(params: {
  readonly boardId: string;
  readonly sourceUserId: string;
  readonly sourceUsersById: ReadonlyMap<string, ImportPreflightUser>;
  readonly actorMap: Map<string, string>;
  readonly source: 'trello' | 'wekan';
  readonly roleKey: string;
  readonly policy: UnmappedUserPolicy;
  readonly importerUserId: string;
  readonly preflight?: ImportPreflightPayloadParsed | undefined;
}): Promise<string | undefined> {
  const cached = params.actorMap.get(params.sourceUserId);
  if (cached != null) {
    return cached;
  }

  const sourceUser = params.sourceUsersById.get(params.sourceUserId);
  const decision = params.preflight?.userDecisions.find((d) => d.sourceUserId === params.sourceUserId);
  const autoMatchedUserId =
    params.actorMap.get(params.sourceUserId) ?? (sourceUser != null ? await autoMatchSourceUser(sourceUser) : undefined);

  const resolution = resolveImportUserResolution({
    ...(decision !== undefined ? { decision } : {}),
    ...(autoMatchedUserId !== undefined ? { autoMatchedUserId } : {}),
    policy: params.policy,
    importerUserId: params.importerUserId,
  });

  let resolvedId: string | undefined;
  switch (resolution.kind) {
    case 'map':
      resolvedId = resolution.userId;
      break;
    case 'discard':
      return undefined;
    case 'create_placeholder': {
      const placeholderSource =
        sourceUser ?? params.sourceUsersById.get(params.sourceUserId) ?? stubImportPreflightUser(params.sourceUserId);
      resolvedId = await getOrCreateBoardImportPlaceholder({
        boardId: params.boardId,
        source: params.source,
        sourceUser: placeholderSource,
        roleKey: params.roleKey,
      });
      break;
    }
  }

  if (resolvedId != null) {
    params.actorMap.set(params.sourceUserId, resolvedId);
  }
  return resolvedId;
}

export async function isImportPlaceholderActorId(actorId: string): Promise<boolean> {
  return isBoardImportPlaceholderId(actorId);
}
