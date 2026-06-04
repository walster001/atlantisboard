import {
  importPreflightUserFromTrelloMemberRecord,
  importPreflightUserFromWekanRecord,
} from './importSourceUserContact.js';
import { normalizeTrelloExport } from './trelloNormalize.js';
import {
  decodeWekanHtmlEntities,
  LEGACY_WEKAN_INLINE_BUTTON_RES,
} from './wekanLegacyInlineHtmlPatterns.js';

export type ImportSourceType = 'trello' | 'wekan';

export interface ImportPreflightUser {
  readonly sourceUserId: string;
  readonly fullName?: string;
  readonly email?: string;
  readonly username?: string;
}

export type UnmappedUserPolicy = 'map_to_importer' | 'discard_unmapped' | 'create_placeholders';

export interface ImportUserDecision {
  readonly sourceUserId: string;
  readonly mappedUserId?: string;
  readonly discard?: boolean;
}

export interface ImportUserPreflight {
  readonly users: readonly ImportPreflightUser[];
}

export interface WekanLegacyInlineButtonCandidate {
  readonly id: string;
  readonly cardId: string;
  readonly cardTitle?: string;
  readonly href: string;
  readonly buttonText: string;
  readonly iconSrc: string;
  readonly originalHtml: string;
}

export interface WekanButtonsPreflight {
  readonly buttons: readonly WekanLegacyInlineButtonCandidate[];
}

export interface InlineButtonIconReplacement {
  readonly iconSrc: string;
  /** data URL (image/*;base64,...) captured during import preflight when replacing the icon. */
  readonly replacementDataUrl?: string;
}

/** Board-wide legacy inline-button colour overrides applied to every imported button. */
export interface InlineButtonImportColorOverrides {
  readonly textColor?: string;
  readonly bgColor?: string;
}

export interface ImportPreflightPayload {
  readonly userDecisions: readonly ImportUserDecision[];
  readonly unmappedUserPolicy: UnmappedUserPolicy;
  readonly inlineButtonIconReplacements?: readonly InlineButtonIconReplacement[];
  readonly inlineButtonImportColorOverrides?: InlineButtonImportColorOverrides;
}

export interface ImportPreflightResult {
  readonly source: ImportSourceType;
  readonly users: ImportUserPreflight;
  readonly wekanButtons?: WekanButtonsPreflight;
}

interface WekanBoardLike {
  readonly _id: string;
  readonly title?: string;
}

interface WekanCardLike {
  readonly _id: string;
  readonly title?: string;
  readonly description?: string;
}

interface WekanUserLike {
  readonly _id: string;
  readonly username?: string;
  readonly emails?: ReadonlyArray<{ readonly address?: string }>;
  readonly profile?: { readonly fullname?: string };
}

interface WekanExportLike {
  readonly boards: readonly WekanBoardLike[];
  readonly cards: readonly WekanCardLike[];
  readonly users: readonly WekanUserLike[];
}

const WEKAN_SINGLE_BOARD_NESTED_KEYS = new Set([
  'lists',
  'cards',
  'labels',
  'checklists',
  'comments',
  'attachments',
  'users',
  'swimlanes',
  'customFields',
  'activities',
  'triggers',
  'integrations',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeWekanPreflightExport(raw: unknown): WekanExportLike {
  const root = asRecord(raw);
  if (root == null) {
    return { boards: [], cards: [], users: [] };
  }

  const dataObj = asRecord(root.data);
  if (dataObj != null) {
    return normalizeWekanPreflightExport(dataObj);
  }

  const boardObj = asRecord(root.board);
  if (boardObj != null && !Array.isArray(root.boards)) {
    return normalizeWekanPreflightExport({
      ...root,
      boards: [boardObj],
    });
  }

  if (Array.isArray(root.boards)) {
    return {
      boards: root.boards.filter((x): x is WekanBoardLike => asRecord(x) != null && str(asRecord(x)?._id) != null),
      cards: Array.isArray(root.cards)
        ? root.cards.filter((x): x is WekanCardLike => asRecord(x) != null && str(asRecord(x)?._id) != null)
        : [],
      users: Array.isArray(root.users)
        ? root.users.filter((x): x is WekanUserLike => asRecord(x) != null && str(asRecord(x)?._id) != null)
        : [],
    };
  }

  // single-board export
  if (str(root._id) != null && (Array.isArray(root.lists) || Array.isArray(root.cards) || str(root._format) != null)) {
    const boardRecord: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(root)) {
      if (!WEKAN_SINGLE_BOARD_NESTED_KEYS.has(key)) {
        boardRecord[key] = value;
      }
    }
    return {
      boards: [boardRecord as unknown as WekanBoardLike],
      cards: Array.isArray(root.cards)
        ? root.cards.filter((x): x is WekanCardLike => asRecord(x) != null && str(asRecord(x)?._id) != null)
        : [],
      users: Array.isArray(root.users)
        ? root.users.filter((x): x is WekanUserLike => asRecord(x) != null && str(asRecord(x)?._id) != null)
        : [],
    };
  }

  return { boards: [], cards: [], users: [] };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function isCandidateIconSource(iconSrc: string): boolean {
  const t = iconSrc.trim();
  if (t === '') {
    return false;
  }

  // Only /cdn/storage references require user-provided replacement uploads.
  // Other references (for example generic URL-based icons) are resolved automatically.
  if (t.startsWith('/cdn/storage/')) {
    return true;
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const parsed = new URL(t);
      return parsed.pathname.startsWith('/cdn/storage/');
    } catch {
      return false;
    }
  }

  return false;
}

export function detectWekanLegacyInlineButtons(
  cards: readonly WekanCardLike[],
): readonly WekanLegacyInlineButtonCandidate[] {
  const out: WekanLegacyInlineButtonCandidate[] = [];

  for (const card of cards) {
    const cardId = str(card._id);
    const descriptionRaw = str(card.description);
    if (cardId == null || descriptionRaw == null) {
      continue;
    }
    // Decode entities so legacy snippets with &quot; quotes can be detected.
    const description = decodeWekanHtmlEntities(descriptionRaw);

    let idx = 0;
    for (const re of LEGACY_WEKAN_INLINE_BUTTON_RES) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null = re.exec(description);
      while (match != null) {
        const full = match[0] ?? '';
        const g1 = decodeWekanHtmlEntities((match[1] ?? '').trim());
        const g2 = decodeWekanHtmlEntities((match[2] ?? '').trim());
        const g3 = decodeWekanHtmlEntities((match[3] ?? '').trim());
        const iconSrc = g1.includes('://') || g1.startsWith('/') ? g1 : g2;
        const href = g1 === iconSrc ? g2 : g1;
        const buttonText = normalizeWhitespace(decodeWekanHtmlEntities(g3 !== '' ? g3 : stripHtmlTags(full)));
        if (isCandidateIconSource(iconSrc) && href !== '' && buttonText !== '') {
          const maybeCardTitle = str(card.title);
          out.push({
            id: `${cardId}:${idx}`,
            cardId,
            ...(maybeCardTitle != null ? { cardTitle: maybeCardTitle } : {}),
            href,
            buttonText,
            iconSrc,
            originalHtml: full,
          });
        }
        idx += 1;
        match = re.exec(description);
      }
    }
  }

  return out;
}

/** Canonical key for matching icon sources within one import preflight (trim + decode URI). */
export function normalizeInlineButtonIconSrcKey(iconSrc: string): string {
  const trimmed = iconSrc.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** Unique `/cdn/storage/` icon sources that require a user-uploaded replacement for this import. */
export function getRequiredWekanReplacementIconSrcs(
  buttons: readonly WekanLegacyInlineButtonCandidate[],
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const button of buttons) {
    const key = normalizeInlineButtonIconSrcKey(button.iconSrc);
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function countResolvedWekanIconReplacements(
  requiredIconSrcs: readonly string[],
  replacements: readonly InlineButtonIconReplacement[] | undefined,
): number {
  const required = new Set(requiredIconSrcs);
  const resolved = new Set<string>();
  for (const entry of replacements ?? []) {
    const key = normalizeInlineButtonIconSrcKey(entry.iconSrc);
    const dataUrl = entry.replacementDataUrl?.trim() ?? '';
    if (key !== '' && dataUrl !== '' && required.has(key)) {
      resolved.add(key);
    }
  }
  return resolved.size;
}

export function assertWekanInlineButtonReplacementsComplete(
  cards: readonly WekanCardLike[],
  replacements: readonly InlineButtonIconReplacement[] | undefined,
): void {
  const required = getRequiredWekanReplacementIconSrcs(detectWekanLegacyInlineButtons(cards));
  if (required.length === 0) {
    return;
  }
  const resolved = countResolvedWekanIconReplacements(required, replacements);
  if (resolved < required.length) {
    const remaining = required.length - resolved;
    throw new Error(
      `Upload a replacement icon for every legacy button icon reference before importing (${remaining} remaining).`,
    );
  }
}

export function buildWekanImportPreflight(raw: unknown): ImportPreflightResult {
  const normalized = normalizeWekanPreflightExport(raw);
  const users: ImportPreflightUser[] = normalized.users.flatMap((u) => {
    const mapped = importPreflightUserFromWekanRecord(u as unknown as Record<string, unknown>);
    return mapped != null ? [mapped] : [];
  });
  const buttons = detectWekanLegacyInlineButtons(normalized.cards);
  return {
    source: 'wekan',
    users: { users },
    ...(buttons.length > 0 ? { wekanButtons: { buttons } } : {}),
  };
}

export function buildTrelloImportPreflight(raw: unknown): ImportPreflightResult {
  const normalized = normalizeTrelloExport(raw);
  const users: ImportPreflightUser[] = (normalized.members ?? []).flatMap((m) => {
    const mapped = importPreflightUserFromTrelloMemberRecord(m as unknown as Record<string, unknown>);
    return mapped != null ? [mapped] : [];
  });
  return {
    source: 'trello',
    users: { users },
  };
}

