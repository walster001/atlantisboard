import type { ImportPreflightUser } from '../../../shared/import/importPreflight.js';
import type { UnmappedUserPolicy } from '../../../shared/import/importPreflight.js';
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import {
  batchGetOrCreateBoardImportPlaceholders,
  type BatchBoardImportPlaceholderEntry,
} from '../boardImportPlaceholderService.js';
import { autoMatchSourceUser } from './importUserMapService.js';

export function stubImportPreflightUser(sourceUserId: string): ImportPreflightUser {
  const trimmed = sourceUserId.trim();
  return {
    sourceUserId: trimmed,
    fullName: `Imported user ${trimmed.slice(0, 8)}`,
  };
}

/** Ensures every referenced id has a catalog row (Wekan often omits some members from `users[]`). */
export function extendSourceUsersById(
  sourceUsers: readonly ImportPreflightUser[],
  referencedIds: Iterable<string>,
): Map<string, ImportPreflightUser> {
  const map = new Map(sourceUsers.map((u) => [u.sourceUserId, u] as const));
  for (const rawId of referencedIds) {
    const id = rawId.trim();
    if (id === '' || map.has(id)) {
      continue;
    }
    map.set(id, stubImportPreflightUser(id));
  }
  return map;
}

export function collectWekanReferencedUserIdsForBoard(
  data: {
    readonly boards: ReadonlyArray<{ readonly _id: string; readonly members?: ReadonlyArray<{ readonly userId: string }> }>;
    readonly cards: ReadonlyArray<{ readonly _id: string; readonly boardId: string; readonly members?: readonly string[] }>;
    readonly comments?: ReadonlyArray<{ readonly cardId: string; readonly userId: string }>;
    readonly attachments?: ReadonlyArray<{ readonly cardId: string; readonly userId: string }>;
  },
  wekanBoardId: string,
): Set<string> {
  const ids = new Set<string>();
  const board = data.boards.find((b) => b._id === wekanBoardId);
  for (const member of board?.members ?? []) {
    const id = member.userId.trim();
    if (id !== '') {
      ids.add(id);
    }
  }

  const cardIdsOnBoard = new Set<string>();
  for (const card of data.cards) {
    if (card.boardId !== wekanBoardId) {
      continue;
    }
    cardIdsOnBoard.add(card._id);
    for (const memberId of card.members ?? []) {
      const id = memberId.trim();
      if (id !== '') {
        ids.add(id);
      }
    }
  }

  for (const comment of data.comments ?? []) {
    if (!cardIdsOnBoard.has(comment.cardId)) {
      continue;
    }
    const id = comment.userId.trim();
    if (id !== '') {
      ids.add(id);
    }
  }

  for (const attachment of data.attachments ?? []) {
    if (!cardIdsOnBoard.has(attachment.cardId)) {
      continue;
    }
    const id = attachment.userId.trim();
    if (id !== '') {
      ids.add(id);
    }
  }

  return ids;
}

function actorMapLookup(actorMap: Map<string, string>, sourceUserId: string): string | undefined {
  const trimmed = sourceUserId.trim();
  return actorMap.get(sourceUserId) ?? (trimmed !== sourceUserId ? actorMap.get(trimmed) : undefined);
}

function actorMapStore(actorMap: Map<string, string>, sourceUserId: string, resolvedId: string): void {
  actorMap.set(sourceUserId, resolvedId);
  const trimmed = sourceUserId.trim();
  if (trimmed !== '' && trimmed !== sourceUserId) {
    actorMap.set(trimmed, resolvedId);
  }
}

/**
 * Creates placeholders (or maps existing users) for every identity on the board when policy allows.
 * Placeholder rows are inserted in batches to avoid per-user round trips on large Wekan boards.
 */
export async function ensureBoardImportPlaceholdersSeeded(params: {
  readonly boardId: string;
  readonly sourceUsersById: ReadonlyMap<string, ImportPreflightUser>;
  readonly referencedSourceUserIds: Iterable<string>;
  readonly actorMap: Map<string, string>;
  readonly source: 'trello' | 'wekan';
  readonly policy: UnmappedUserPolicy;
  readonly importerUserId: string;
  readonly preflight?: ImportPreflightPayloadParsed | undefined;
  readonly resolveBoardRoleKey: (sourceUserId: string) => string;
}): Promise<void> {
  if (params.policy !== 'create_placeholders') {
    return;
  }

  const toResolve = new Set<string>([...params.referencedSourceUserIds, ...params.sourceUsersById.keys()]);
  const placeholderEntries: BatchBoardImportPlaceholderEntry[] = [];

  for (const sourceUserId of toResolve) {
    if (sourceUserId.trim() === '') {
      continue;
    }
    if (actorMapLookup(params.actorMap, sourceUserId) != null) {
      continue;
    }

    const trimmed = sourceUserId.trim();
    const sourceUser =
      params.sourceUsersById.get(sourceUserId) ?? params.sourceUsersById.get(trimmed);
    const decision = params.preflight?.userDecisions.find(
      (d) => d.sourceUserId === sourceUserId || d.sourceUserId === trimmed,
    );
    const autoMatchedUserId =
      actorMapLookup(params.actorMap, sourceUserId) ??
      (sourceUser != null ? await autoMatchSourceUser(sourceUser) : undefined);

    const resolution = resolveImportUserResolution({
      ...(decision !== undefined ? { decision } : {}),
      ...(autoMatchedUserId !== undefined ? { autoMatchedUserId } : {}),
      policy: params.policy,
      importerUserId: params.importerUserId,
    });

    switch (resolution.kind) {
      case 'map':
        actorMapStore(params.actorMap, sourceUserId, resolution.userId);
        break;
      case 'discard':
        break;
      case 'create_placeholder': {
        const placeholderSource =
          sourceUser ?? params.sourceUsersById.get(trimmed) ?? stubImportPreflightUser(trimmed);
        placeholderEntries.push({
          sourceUser: placeholderSource,
          roleKey: params.resolveBoardRoleKey(sourceUserId),
        });
        break;
      }
    }
  }

  if (placeholderEntries.length === 0) {
    return;
  }

  const created = await batchGetOrCreateBoardImportPlaceholders({
    boardId: params.boardId,
    source: params.source,
    entries: placeholderEntries,
  });

  for (const [sourceUserId, placeholderId] of created) {
    actorMapStore(params.actorMap, sourceUserId, placeholderId);
  }
}
