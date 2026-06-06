import mongoose from 'mongoose';
import type { UnmappedUserPolicy } from '../../../shared/import/importPreflight.js';
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import type { ImportPreflightUser } from '../../../shared/import/importPreflight.js';
import {
  importActorIdAllowedForPolicy,
  importActorIdEligibleAsBoardMember,
  type ImportActorAccountKind,
} from '../../../shared/import/importActorPolicy.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import { User } from '../../models/User.js';
import { stubImportPreflightUser } from './importSourceUserCatalog.js';
import { getOrCreateBoardImportPlaceholder, isBoardImportPlaceholderId } from '../boardImportPlaceholderService.js';

const REGISTERED_USER_FILTER = { isPlaceholder: { $ne: true } } as const;

function actorMapLookup(actorMap: Map<string, string>, sourceUserId: string): string | undefined {
  const trimmed = sourceUserId.trim();
  return actorMap.get(sourceUserId) ?? (trimmed !== sourceUserId ? actorMap.get(trimmed) : undefined);
}

export async function classifyImportActorId(actorId: string): Promise<ImportActorAccountKind | null> {
  if (!mongoose.Types.ObjectId.isValid(actorId)) {
    return null;
  }
  if (await isBoardImportPlaceholderId(actorId)) {
    return 'board_placeholder';
  }
  const user = await User.findById(actorId).select('isPlaceholder').lean();
  if (user == null) {
    return null;
  }
  return user.isPlaceholder === true ? 'legacy_placeholder_user' : 'registered';
}

export async function isEligibleImportBoardMemberActorId(
  actorId: string,
  _policy: UnmappedUserPolicy,
): Promise<boolean> {
  const kind = await classifyImportActorId(actorId);
  if (kind == null) {
    return false;
  }
  return importActorIdEligibleAsBoardMember(kind);
}

async function filterImportActorIdForPolicy(
  actorId: string,
  policy: UnmappedUserPolicy,
): Promise<string | undefined> {
  const kind = await classifyImportActorId(actorId);
  if (kind == null) {
    return undefined;
  }
  if (!importActorIdAllowedForPolicy(kind, policy)) {
    return undefined;
  }
  return actorId;
}

export async function autoMatchSourceUser(sourceUser: ImportPreflightUser): Promise<string | undefined> {
  const email = sourceUser.email?.trim();
  if (email != null && email.length > 0) {
    const byEmail = await User.findOne({ email: email.toLowerCase(), ...REGISTERED_USER_FILTER });
    if (byEmail) {
      return byEmail._id.toString();
    }
  }
  const username = sourceUser.username?.trim();
  if (username != null && username.length >= 3) {
    const byUsername = await User.findOne({ username, ...REGISTERED_USER_FILTER });
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
  const cached = actorMapLookup(params.actorMap, params.sourceUserId);
  if (cached != null) {
    const allowed = await filterImportActorIdForPolicy(cached, params.policy);
    if (allowed != null) {
      return allowed;
    }
  }

  const sourceUser =
    params.sourceUsersById.get(params.sourceUserId) ??
    params.sourceUsersById.get(params.sourceUserId.trim());
  const trimmedId = params.sourceUserId.trim();
  const decision = params.preflight?.userDecisions.find(
    (d) => d.sourceUserId === params.sourceUserId || d.sourceUserId === trimmedId,
  );
  const autoMatchedUserId =
    actorMapLookup(params.actorMap, params.sourceUserId) ??
    (sourceUser != null ? await autoMatchSourceUser(sourceUser) : undefined);

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
    const allowed = await filterImportActorIdForPolicy(resolvedId, params.policy);
    if (allowed != null) {
      params.actorMap.set(params.sourceUserId, allowed);
      const trimmed = params.sourceUserId.trim();
      if (trimmed !== '' && trimmed !== params.sourceUserId) {
        params.actorMap.set(trimmed, allowed);
      }
      return allowed;
    }
    return undefined;
  }
  return undefined;
}

export async function isImportPlaceholderActorId(actorId: string): Promise<boolean> {
  const kind = await classifyImportActorId(actorId);
  return kind === 'board_placeholder' || kind === 'legacy_placeholder_user';
}
