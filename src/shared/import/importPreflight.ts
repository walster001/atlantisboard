import { normalizeTrelloExport } from './trelloNormalize.js';

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
  /** data URL (image/*;base64,...) captured during import preflight. */
  readonly replacementDataUrl: string;
}

export interface ImportPreflightPayload {
  readonly userDecisions: readonly ImportUserDecision[];
  readonly unmappedUserPolicy: UnmappedUserPolicy;
  readonly inlineButtonIconReplacements?: readonly InlineButtonIconReplacement[];
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Legacy Wekan inline-button snippet:
// <span ... display:inline-flex;><img ... src='...'><a ... href='...'>TEXT</a></span>
const LEGACY_INLINE_BUTTON_RE =
  /<span[^>]*display\s*:\s*inline-flex[^>]*>\s*<img[^>]*src=['"]([^'"]+)['"][^>]*>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/span>/gi;

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
    const description = str(card.description);
    if (cardId == null || description == null) {
      continue;
    }

    LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
    let idx = 0;
    let match: RegExpExecArray | null = LEGACY_INLINE_BUTTON_RE.exec(description);
    while (match != null) {
      const iconSrc = decodeHtmlEntities((match[1] ?? '').trim());
      const href = decodeHtmlEntities((match[2] ?? '').trim());
      const buttonText = normalizeWhitespace(decodeHtmlEntities(match[3] ?? ''));
      if (isCandidateIconSource(iconSrc) && href !== '' && buttonText !== '') {
        const maybeCardTitle = str(card.title);
        out.push({
          id: `${cardId}:${idx}`,
          cardId,
          ...(maybeCardTitle != null ? { cardTitle: maybeCardTitle } : {}),
          href,
          buttonText,
          iconSrc,
          originalHtml: match[0],
        });
      }
      idx += 1;
      match = LEGACY_INLINE_BUTTON_RE.exec(description);
    }
  }

  return out;
}

export function buildWekanImportPreflight(raw: unknown): ImportPreflightResult {
  const normalized = normalizeWekanPreflightExport(raw);
  const users: ImportPreflightUser[] = normalized.users.map((u) => {
    const fullName = str(u.profile?.fullname);
    const email = str(u.emails?.[0]?.address);
    const username = str(u.username);
    return {
      sourceUserId: u._id,
      ...(fullName != null ? { fullName } : {}),
      ...(email != null ? { email } : {}),
      ...(username != null ? { username } : {}),
    };
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
  const users: ImportPreflightUser[] = (normalized.members ?? []).map((m) => {
    const fullName = str(m.fullName);
    const email = str(m.email);
    const username = str(m.username);
    return {
      sourceUserId: m.id,
      ...(fullName != null ? { fullName } : {}),
      ...(email != null ? { email } : {}),
      ...(username != null ? { username } : {}),
    };
  });
  return {
    source: 'trello',
    users: { users },
  };
}

