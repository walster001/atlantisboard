import mongoose from 'mongoose';
import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card } from '../../models/Card.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { Workspace } from '../../models/Workspace.js';
import { User } from '../../models/User.js';
import { ImportJob } from '../../models/ImportJob.js';
import { logger } from '../../utils/logger.js';
import { createActivity } from '../activityService.js';
import { emitToUser } from '../../utils/socketIO.js';
import {
  buildTrelloImportInlineButton,
  type InlineButtonDocNode,
} from '../../../shared/utils/trelloImportInlineButton.js';
import { plainTextToCardDescriptionJson } from '../../../shared/utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../../../shared/utils/markdownToCardDescriptionJson.js';
import { CARD_DESCRIPTION_JSON_MAX_LENGTH } from '../../../shared/constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../../../shared/validation/cardDescriptionDoc.js';
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import { mapWekanBoardMemberToBoardRoleKey } from '../../../shared/import/wekanBoardMemberRoleMap.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import { uploadImportInlineImage } from '../importInlineAssetService.js';
import { resolveImportedCardColour } from '../../../shared/utils/importDefaultCardColour.js';
import { cssNamedColorToHex } from '../../../shared/utils/cssNamedColorToHex.js';
import { wekanCardLabelColourToHex } from '../../../shared/utils/wekanCardLabelPalette.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
  CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
} from '../../../shared/constants/entityTextLimits.js';
import crypto from 'node:crypto';
import { deriveCardDescriptionPreview } from '../cardViewService.js';
import { renderCardDescriptionHtml } from '../../utils/cardDescriptionHtml.js';

interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  archived: boolean;
  background?: string;
  permission?: 'private' | 'public';
  members?: Array<{
    userId: string;
    isAdmin: boolean;
    isActive: boolean;
    isCommentOnly: boolean;
    isNoComments: boolean;
    isWorker: boolean;
    isReadOnly: boolean;
    isReadAssignedOnly: boolean;
    isNormalAssignedOnly: boolean;
    isCommentAssignedOnly: boolean;
    permission?: string;
  }>;
}

interface WekanList {
  _id: string;
  title: string;
  boardId: string;
  sort: number;
  archived: boolean;
  color?: string;
  wipLimit?: number;
}

interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  boardId: string;
  sort: number;
  archived: boolean;
  color?: string;
  dueAt?: string;
  startAt?: string;
  finishedAt?: string;
  cover?: string;
  members?: string[];
  labelIds?: string[];
  createdAt: string;
  modifiedAt: string;
}

interface WekanLabel {
  _id: string;
  name: string;
  color: string;
  boardId: string;
}

const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/;
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/;
function normalizeImportedColour(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return undefined;
  }
  if (HEX_6_RE.test(trimmed)) {
    return trimmed;
  }
  if (HEX_3_RE.test(trimmed)) {
    const t = trimmed.slice(1);
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  const wekanHex = wekanCardLabelColourToHex(trimmed);
  if (wekanHex !== undefined) {
    return wekanHex;
  }
  const mapped = cssNamedColorToHex(trimmed);
  return mapped;
}

interface WekanChecklist {
  _id: string;
  title: string;
  cardId: string;
  items?: Array<{
    _id: string;
    title: string;
    sortOrder: number;
    finishedAt?: string;
    isFinished: boolean;
  }>;
}

interface WekanComment {
  _id: string;
  cardId: string;
  text: string;
  userId: string;
  createdAt: string;
  modifiedAt?: string;
}

interface WekanAttachment {
  _id: string;
  cardId: string;
  name: string;
  path?: string;
  url?: string;
  type: string;
  size?: number;
  userId: string;
  uploadedAt: string;
}

interface WekanUser {
  _id: string;
  username?: string;
  emails?: Array<{
    address: string;
    verified: boolean;
  }>;
  profile?: {
    fullname?: string;
  };
}

interface WekanExport {
  boards: WekanBoard[];
  lists: WekanList[];
  cards: WekanCard[];
  labels?: WekanLabel[];
  checklists?: WekanChecklist[];
  comments?: WekanComment[];
  attachments?: WekanAttachment[];
  users?: WekanUser[];
}

function readWekanId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const oid = record.$oid;
    if (typeof oid === 'string' && oid.trim() !== '') {
      return oid.trim();
    }
    const id = record.id;
    if (typeof id === 'string' && id.trim() !== '') {
      return id.trim();
    }
  }
  return undefined;
}

function normalizeWekanBoardRecord(record: Record<string, unknown>): WekanBoard | null {
  const _id = readWekanId(record._id);
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || title.trim() === '') {
    return null;
  }
  const memberEntries = Array.isArray(record.members)
    ? (record.members as unknown[]).flatMap((member) => {
        if (typeof member !== 'object' || member === null) {
          return [];
        }
        const m = member as Record<string, unknown>;
        const userId = readWekanId(m.userId) ?? readWekanId(m.memberId) ?? readWekanId(m._id);
        if (userId == null) {
          return [];
        }
        return [
          {
            userId,
            isAdmin: m.isAdmin === true,
            isActive: m.isActive !== false,
            isCommentOnly: m.isCommentOnly === true,
            isNoComments: m.isNoComments === true,
            isWorker: m.isWorker === true,
            isReadOnly: m.isReadOnly === true,
            isReadAssignedOnly: m.isReadAssignedOnly === true,
            isNormalAssignedOnly: m.isNormalAssignedOnly === true,
            isCommentAssignedOnly: m.isCommentAssignedOnly === true,
            ...(typeof m.permission === 'string' && m.permission.trim() !== ''
              ? { permission: m.permission.trim() }
              : {}),
          },
        ];
      })
    : undefined;
  return {
    _id,
    title,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    archived: record.archived === true,
    ...(typeof record.background === 'string' ? { background: record.background } : {}),
    ...(record.permission === 'private' || record.permission === 'public'
      ? { permission: record.permission }
      : {}),
    ...(memberEntries !== undefined ? { members: memberEntries } : {}),
  };
}

function normalizeWekanListRecord(
  record: Record<string, unknown>,
  parentBoardId?: string,
): WekanList | null {
  const _id = readWekanId(record._id);
  const boardId =
    readWekanId(record.boardId) ??
    readWekanId(record.idBoard) ??
    readWekanId(record.board) ??
    parentBoardId;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || boardId == null || title.trim() === '') {
    return null;
  }
  const sortRaw = record.sort ?? record.pos ?? record.position;
  const sort =
    typeof sortRaw === 'number' && Number.isFinite(sortRaw)
      ? sortRaw
      : typeof sortRaw === 'string' && sortRaw.trim() !== '' && Number.isFinite(Number(sortRaw))
        ? Number(sortRaw)
        : 0;
  return {
    _id,
    boardId,
    title,
    sort,
    archived: record.archived === true,
    ...(typeof record.color === 'string' ? { color: record.color } : {}),
    ...(typeof record.wipLimit === 'number' && Number.isFinite(record.wipLimit)
      ? { wipLimit: record.wipLimit }
      : {}),
  };
}

function normalizeWekanCardRecord(
  record: Record<string, unknown>,
  parentBoardId?: string,
): WekanCard | null {
  const _id = readWekanId(record._id);
  const listId = readWekanId(record.listId) ?? readWekanId(record.idList) ?? readWekanId(record.list);
  const boardId =
    readWekanId(record.boardId) ??
    readWekanId(record.idBoard) ??
    readWekanId(record.board) ??
    parentBoardId;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || listId == null || boardId == null || title.trim() === '') {
    return null;
  }
  const sortRaw = record.sort ?? record.pos ?? record.position;
  const sort =
    typeof sortRaw === 'number' && Number.isFinite(sortRaw)
      ? sortRaw
      : typeof sortRaw === 'string' && sortRaw.trim() !== '' && Number.isFinite(Number(sortRaw))
        ? Number(sortRaw)
        : 0;
  return {
    _id,
    listId,
    boardId,
    title,
    sort,
    archived: record.archived === true,
    ...(typeof record.color === 'string' ? { color: record.color } : {}),
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    ...(typeof record.dueAt === 'string' ? { dueAt: record.dueAt } : {}),
    ...(typeof record.startAt === 'string' ? { startAt: record.startAt } : {}),
    ...(typeof record.finishedAt === 'string' ? { finishedAt: record.finishedAt } : {}),
    ...(typeof record.cover === 'string' ? { cover: record.cover } : {}),
    ...(Array.isArray(record.members)
      ? {
          members: record.members
            .map((m) => readWekanId(m))
            .filter((m): m is string => m !== undefined),
        }
      : {}),
    ...(Array.isArray(record.labelIds)
      ? {
          labelIds: record.labelIds
            .map((id) => readWekanId(id))
            .filter((id): id is string => id !== undefined),
        }
      : Array.isArray(record.labels)
        ? {
            labelIds: record.labels
              .map((label) => readWekanId(label))
              .filter((id): id is string => id !== undefined),
          }
      : {}),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    modifiedAt: typeof record.modifiedAt === 'string' ? record.modifiedAt : new Date().toISOString(),
  };
}

function normalizeWekanExportData(
  raw: WekanExport,
  options?: { singleBoardIdHint?: string },
): WekanExport {
  const singleBoardIdHint = options?.singleBoardIdHint;
  const boards = (raw.boards ?? [])
    .flatMap((b) => {
      const normalized = normalizeWekanBoardRecord(b as unknown as Record<string, unknown>);
      return normalized != null ? [normalized] : [];
    });
  const lists = (raw.lists ?? [])
    .flatMap((l) => {
      const normalized = normalizeWekanListRecord(
        l as unknown as Record<string, unknown>,
        singleBoardIdHint,
      );
      return normalized != null ? [normalized] : [];
    });
  const cards = (raw.cards ?? [])
    .flatMap((c) => {
      const normalized = normalizeWekanCardRecord(
        c as unknown as Record<string, unknown>,
        singleBoardIdHint,
      );
      return normalized != null ? [normalized] : [];
    });

  return {
    ...raw,
    boards,
    lists,
    cards,
    ...(Array.isArray(raw.users)
      ? {
          users: raw.users.flatMap((u) => {
            const id = readWekanId((u as unknown as Record<string, unknown>)._id);
            return id != null ? [{ ...u, _id: id }] : [];
          }),
        }
      : {}),
    ...(Array.isArray(raw.labels)
      ? {
          labels: raw.labels.flatMap((lab) => {
            const id = readWekanId((lab as unknown as Record<string, unknown>)._id);
            const boardId =
              readWekanId((lab as unknown as Record<string, unknown>).boardId) ??
              readWekanId((lab as unknown as Record<string, unknown>).idBoard) ??
              singleBoardIdHint;
            return id != null && boardId != null ? [{ ...lab, _id: id, boardId }] : [];
          }),
        }
      : {}),
  };
}

function normalizeKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function sanitizeImportedPlainText(value: string): string {
  return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, ' ').trim();
}

function sanitizeImportedDescriptionText(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n');
  const stripped = decodeHtmlEntities(stripHtmlTags(withBreaks));
  return stripped
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LEGACY_INLINE_BUTTON_RE =
  /<span[^>]*display\s*:\s*inline-flex[^>]*>\s*<img[^>]*src=['"]([^'"]+)['"][^>]*>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/span>/gi;
const LEGACY_HORIZONTAL_RULE_RE = /<\s*hr\b[^>]*>(?:\s*<\/\s*hr\s*>)?/gi;

function parseInlineStyleDeclarations(styleAttr: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawDecl of styleAttr.split(';')) {
    const idx = rawDecl.indexOf(':');
    if (idx <= 0) {
      continue;
    }
    const key = rawDecl.slice(0, idx).trim().toLowerCase();
    const value = rawDecl.slice(idx + 1).trim();
    if (key !== '' && value !== '') {
      out.set(key, value);
    }
  }
  return out;
}

function extractStyleAttributeFromOpeningTag(openingTag: string): string | null {
  const styleMatch = /\sstyle\s*=\s*(['"])([\s\S]*?)\1/i.exec(openingTag);
  if (styleMatch == null) {
    return null;
  }
  const styleRaw = decodeHtmlEntities((styleMatch[2] ?? '').trim());
  return styleRaw === '' ? null : styleRaw;
}

function extractInlineStyleDeclarationsFromTag(
  html: string,
  tagName: 'span' | 'a',
): Map<string, string> {
  const openingTagMatch = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  if (openingTagMatch == null) {
    return new Map<string, string>();
  }
  const style = extractStyleAttributeFromOpeningTag(openingTagMatch[0]);
  if (style == null) {
    return new Map<string, string>();
  }
  return parseInlineStyleDeclarations(style);
}

function normalizeImportedInlineColor(value: string | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') {
    return null;
  }
  // Keep this intentionally strict; these values are persisted and rendered inline in Tiptap attrs.
  if (!/^[#(),.%/\-\s0-9a-zA-Z]+$/.test(raw)) {
    return null;
  }
  return raw.slice(0, 80);
}

function extractInlineButtonColorsFromLegacySpan(fullHtml: string): {
  textColor?: string;
  bgColor?: string;
} {
  const spanDecls = extractInlineStyleDeclarationsFromTag(fullHtml, 'span');
  const anchorDecls = extractInlineStyleDeclarationsFromTag(fullHtml, 'a');
  // Fidelity: Wekan often stores the button text color on <a>, while background lives on <span>.
  const textColor =
    normalizeImportedInlineColor(anchorDecls.get('color')) ??
    normalizeImportedInlineColor(spanDecls.get('color'));
  const bgColor =
    normalizeImportedInlineColor(spanDecls.get('background-color')) ??
    normalizeImportedInlineColor(spanDecls.get('background')) ??
    normalizeImportedInlineColor(anchorDecls.get('background-color')) ??
    normalizeImportedInlineColor(anchorDecls.get('background'));
  return {
    ...(textColor != null ? { textColor } : {}),
    ...(bgColor != null ? { bgColor } : {}),
  };
}

function plainTextParagraphNodes(raw: string): Array<Record<string, unknown>> {
  const text = raw.trim();
  if (text === '') {
    return [];
  }
  return text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
    .map((segment) => ({
      type: 'paragraph',
      content: segment
        .split(/\n/)
        .flatMap((line, idx) =>
          idx === 0
            ? [{ type: 'text', text: line }]
            : [{ type: 'hardBreak' }, { type: 'text', text: line }],
        ),
    }));
}

/** When `plainOnly`, keep legacy behaviour (paragraphs only). Otherwise parse Markdown → Tiptap blocks. */
function pushMarkdownOrPlainAsBlocks(
  raw: string,
  nodes: Array<Record<string, unknown>>,
  plainOnly: boolean
): void {
  if (plainOnly) {
    nodes.push(...plainTextParagraphNodes(raw));
    return;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return;
  }
  const fromMd = markdownToCardDescriptionJson(trimmed);
  if (fromMd != null) {
    try {
      const parsed = JSON.parse(fromMd) as { type?: unknown; content?: unknown };
      if (parsed.type === 'doc' && Array.isArray(parsed.content)) {
        for (const block of parsed.content) {
          if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
            nodes.push(block as Record<string, unknown>);
          }
        }
        return;
      }
    } catch {
      /* fall through to plain */
    }
  }
  nodes.push(...plainTextParagraphNodes(raw));
}

function buildWekanDescriptionDocNodes(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, string>,
  localizedByIconSrc: ReadonlyMap<string, string>,
  plainTextSegmentsOnly: boolean
): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  let cursor = 0;
  LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
  LEGACY_HORIZONTAL_RULE_RE.lastIndex = 0;
  while (cursor < description.length) {
    LEGACY_INLINE_BUTTON_RE.lastIndex = cursor;
    LEGACY_HORIZONTAL_RULE_RE.lastIndex = cursor;
    const inlineMatch = LEGACY_INLINE_BUTTON_RE.exec(description);
    const hrMatch = LEGACY_HORIZONTAL_RULE_RE.exec(description);
    if (inlineMatch == null && hrMatch == null) {
      break;
    }
    const nextMatch =
      inlineMatch != null && (hrMatch == null || inlineMatch.index <= hrMatch.index)
        ? { kind: 'inlineButton' as const, match: inlineMatch }
        : { kind: 'horizontalRule' as const, match: hrMatch as RegExpExecArray };
    const before = description.slice(cursor, nextMatch.match.index);
    pushMarkdownOrPlainAsBlocks(before, nodes, plainTextSegmentsOnly);
    if (nextMatch.kind === 'horizontalRule') {
      nodes.push({ type: 'horizontalRule' });
      cursor = nextMatch.match.index + nextMatch.match[0].length;
      continue;
    }
    const [full, rawIconSrc, rawHref, rawButtonText] = nextMatch.match;
    const iconSrc = decodeHtmlEntities((rawIconSrc ?? '').trim());
    const href = decodeHtmlEntities((rawHref ?? '').trim());
    const buttonText = decodeHtmlEntities((rawButtonText ?? '').replace(/\s+/g, ' ').trim());
    const inlineButton = buildTrelloImportInlineButton(href, buttonText);
    if (inlineButton != null) {
      const replacement = replacementByIconSrc.get(iconSrc);
      const localized = localizedByIconSrc.get(iconSrc);
      const colors = extractInlineButtonColorsFromLegacySpan(full);
      const attrs = {
        ...inlineButton.attrs,
        ...colors,
        ...(replacement != null
          ? { iconSrc: replacement }
          : localized != null
            ? { iconSrc: localized }
            : {}),
      };
      nodes.push({
        type: (inlineButton as InlineButtonDocNode).type,
        attrs,
      });
    } else {
      pushMarkdownOrPlainAsBlocks(full, nodes, true);
    }
    cursor = nextMatch.match.index + full.length;
  }
  const tail = description.slice(cursor);
  pushMarkdownOrPlainAsBlocks(tail, nodes, plainTextSegmentsOnly);
  return nodes;
}

function wekanDescriptionToCardJson(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, string>,
  localizedByIconSrc: ReadonlyMap<string, string>,
): string {
  if (description.trim() === '') {
    return '';
  }
  let nodes = buildWekanDescriptionDocNodes(
    description,
    replacementByIconSrc,
    localizedByIconSrc,
    false,
  );
  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  let doc: { type: 'doc'; content: Array<Record<string, unknown>> } = {
    type: 'doc',
    content: nodes,
  };
  let json = JSON.stringify(doc);
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH || !isValidCardDescriptionDoc(doc)) {
    nodes = buildWekanDescriptionDocNodes(description, replacementByIconSrc, localizedByIconSrc, true);
    doc = { type: 'doc', content: nodes };
    json = JSON.stringify(doc);
  }
  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH || !isValidCardDescriptionDoc(doc)) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  return json;
}

/** Matches Trello import card bulk-insert chunk size (`trelloImportService`). */
const WEKAN_CARD_INSERT_BATCH = 80;

function groupWekanRowsByCardId<T extends { cardId: string }>(rows: readonly T[] | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  if (rows == null) {
    return m;
  }
  for (const row of rows) {
    const key = row.cardId;
    const prev = m.get(key);
    if (prev != null) {
      prev.push(row);
    } else {
      m.set(key, [row]);
    }
  }
  return m;
}

interface WekanCardInsertContext {
  readonly listMap: ReadonlyMap<string, string>;
  readonly boardMap: ReadonlyMap<string, string>;
  readonly userMap: ReadonlyMap<string, string>;
  readonly labelMap: ReadonlyMap<string, { id: string; name: string; color: string }>;
  readonly checklistsByCardId: ReadonlyMap<string, WekanChecklist[]>;
  readonly commentsByCardId: ReadonlyMap<string, WekanComment[]>;
  readonly attachmentsByCardId: ReadonlyMap<string, WekanAttachment[]>;
  readonly replacementByIconSrc: ReadonlyMap<string, string>;
  readonly localizedByIconSrc: ReadonlyMap<string, string>;
  readonly defaultUncolouredCardColour: string | undefined;
  readonly userId: string;
}

function buildWekanCardInsertPlainObject(
  wekanCard: WekanCard,
  ctx: WekanCardInsertContext,
): Record<string, unknown> | undefined {
  const listIdStr = ctx.listMap.get(wekanCard.listId);
  const boardIdStr = ctx.boardMap.get(wekanCard.boardId);
  if (listIdStr == null || boardIdStr == null) {
    return undefined;
  }

  const cardLabels = (wekanCard.labelIds || [])
    .map((labelId) => ctx.labelMap.get(labelId))
    .filter((meta): meta is { id: string; name: string; color: string } => meta !== undefined)
    .map((meta) => ({
      id: meta.id,
      name: meta.name,
      color: meta.color,
    }));

  const assigneeIds = (wekanCard.members || [])
    .map((memberId) => {
      const mappedId = ctx.userMap.get(memberId);
      return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
    })
    .filter((id): id is mongoose.Types.ObjectId => id !== null);

  const cardChecklists = (ctx.checklistsByCardId.get(wekanCard._id) ?? []).map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.title,
    items: (checklist.items || []).map((item) => ({
      id: crypto.randomUUID(),
      text: item.title,
      completed: item.isFinished || false,
      completedAt: item.finishedAt ? new Date(item.finishedAt) : undefined,
      sortOrder: item.sortOrder,
    })),
  }));

  const cardComments = (ctx.commentsByCardId.get(wekanCard._id) ?? []).map((comment) => {
    const commentUserId = ctx.userMap.get(comment.userId);
    return {
      id: crypto.randomUUID(),
      userId: new mongoose.Types.ObjectId(commentUserId || ctx.userId),
      text: comment.text,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(comment.modifiedAt || comment.createdAt),
    };
  });

  const cardAttachments = (ctx.attachmentsByCardId.get(wekanCard._id) ?? []).map((attachment) => {
    const rawName = (attachment.name || 'attachment').trim();
    const storedName =
      rawName.length > 0 ? rawName.slice(0, CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH) : 'attachment';
    return {
      id: crypto.randomUUID(),
      name: storedName,
      originalFileName: storedName,
      url: '',
      isPlaceholder: true,
      type: attachment.type || 'unknown',
      size: attachment.size || 0,
      uploadedAt: new Date(attachment.uploadedAt),
      uploadedBy: new mongoose.Types.ObjectId(ctx.userMap.get(attachment.userId) || ctx.userId),
    };
  });

  const sanitizedCardTitle = sanitizeImportedPlainText(wekanCard.title) || 'Untitled card';

  let description: string | undefined;
  let descriptionHtml = '';
  let descriptionPreview = '';
  let descriptionCharCount = 0;
  if (typeof wekanCard.description === 'string' && wekanCard.description.trim() !== '') {
    const descStr = wekanDescriptionToCardJson(
      wekanCard.description,
      ctx.replacementByIconSrc,
      ctx.localizedByIconSrc,
    );
    description = descStr !== '' ? descStr : undefined;
    if (description != null && description !== '') {
      const pv = deriveCardDescriptionPreview(description);
      descriptionPreview = pv.preview;
      descriptionCharCount = pv.charCount;
      descriptionHtml = renderCardDescriptionHtml(description);
    }
  }

  return {
    listId: new mongoose.Types.ObjectId(listIdStr),
    boardId: new mongoose.Types.ObjectId(boardIdStr),
    title: sanitizedCardTitle.slice(0, CARD_TITLE_MAX_LENGTH),
    ...(description !== undefined ? { description } : {}),
    descriptionHtml,
    descriptionPreview,
    descriptionCharCount,
    position: wekanCard.sort || 0,
    color: resolveImportedCardColour(
      normalizeImportedColour(wekanCard.color) ??
        (/^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? wekanCard.cover : undefined),
      ctx.defaultUncolouredCardColour,
    ),
    cover: /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? undefined : wekanCard.cover,
    labels: cardLabels,
    dueDate: wekanCard.dueAt ? new Date(wekanCard.dueAt) : undefined,
    startDate: wekanCard.startAt ? new Date(wekanCard.startAt) : undefined,
    completed: !!wekanCard.finishedAt,
    completedAt: wekanCard.finishedAt ? new Date(wekanCard.finishedAt) : undefined,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
    assignees: assigneeIds,
    reminders: [],
    attachments: cardAttachments,
    comments: cardComments,
    checklists: cardChecklists,
  };
}

function inferImageMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.svg')) return 'image/svg+xml';
  if (lower.includes('.ico')) return 'image/x-icon';
  return 'image/png';
}

function resolveFetchableIconUrl(iconSrc: string): string | null {
  const trimmed = iconSrc.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/cdn') || trimmed.startsWith('/api/')) {
    const base = (process.env.APP_URL || process.env.CORS_ORIGIN || '').trim().replace(/\/$/, '');
    if (base === '') {
      return null;
    }
    return `${base}${trimmed}`;
  }
  return null;
}

async function buildLocalizedInlineIconMap(
  buttons: readonly { iconSrc: string }[],
): Promise<Map<string, string>> {
  const localizedByIconSrc = new Map<string, string>();
  const uniqueIconSources = [...new Set(buttons.map((b) => b.iconSrc.trim()).filter((s) => s !== ''))];
  for (const iconSrc of uniqueIconSources) {
    const fetchable = resolveFetchableIconUrl(iconSrc);
    if (fetchable == null) {
      continue;
    }
    try {
      const response = await fetch(fetchable);
      if (!response.ok) {
        continue;
      }
      const contentTypeRaw = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const contentType =
        contentTypeRaw.startsWith('image/') ? contentTypeRaw : inferImageMimeFromUrl(fetchable);
      const arr = await response.arrayBuffer();
      const buffer = Buffer.from(arr);
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        continue;
      }
      const localUrl = await uploadImportInlineImage(buffer, contentType, iconSrc.split('/').pop());
      localizedByIconSrc.set(iconSrc, localUrl);
    } catch (error) {
      logger.warn({ error, iconSrc }, 'Failed to localize imported inline button icon');
    }
  }
  return localizedByIconSrc;
}

function extractLegacyInlineButtonCandidates(cards: readonly WekanCard[]): Array<{ iconSrc: string }> {
  const out: Array<{ iconSrc: string }> = [];
  for (const card of cards) {
    const description = typeof card.description === 'string' ? card.description : '';
    if (description.trim() === '') {
      continue;
    }
    LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
    let match: RegExpExecArray | null = LEGACY_INLINE_BUTTON_RE.exec(description);
    while (match != null) {
      const iconSrc = decodeHtmlEntities((match[1] ?? '').trim());
      if (iconSrc !== '') {
        out.push({ iconSrc });
      }
      match = LEGACY_INLINE_BUTTON_RE.exec(description);
    }
  }
  return out;
}

/** Keys Wekan nests alongside board fields in a single-board JSON export (not part of the board document). */
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

function stripToWekanBoard(obj: Record<string, unknown>): WekanBoard {
  const board: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!WEKAN_SINGLE_BOARD_NESTED_KEYS.has(key)) {
      board[key] = value;
    }
  }
  return board as unknown as WekanBoard;
}

/**
 * Wekan can export either:
 * - Aggregate: `{ boards: [...], lists: [...], cards: [...], ... }`
 * - Single board (common from UI): one object with `_id`, `title`, and `lists` / `cards` at the same level as board fields.
 */
function normalizeWekanExport(raw: unknown): WekanExport {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Wekan import: expected a JSON object at the root.');
  }

  const o = raw as Record<string, unknown>;

  if (typeof o.data === 'object' && o.data !== null && !Array.isArray(o.data)) {
    return normalizeWekanExport(o.data);
  }

  if (o.board != null && typeof o.board === 'object' && !Array.isArray(o.boards)) {
    const { board, ...rest } = o;
    const normalized = normalizeWekanExport({
      ...rest,
      boards: [board as Record<string, unknown>],
    });
    if (normalized.boards.length !== 1) {
      throw new Error('Wekan import: only single-board exports are supported.');
    }
    return normalizeWekanExportData(normalized, {
      singleBoardIdHint: normalized.boards[0]?._id,
    });
  }

  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const boardObjects = o.boards
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => b as Record<string, unknown>);
    const normalizedBoards = boardObjects
      .map((b) => normalizeWekanBoardRecord(stripToWekanBoard(b) as unknown as Record<string, unknown>))
      .filter((b): b is WekanBoard => b !== null);
    const nestedLists = boardObjects.flatMap((b) => {
      if (!Array.isArray(b.lists)) {
        return [];
      }
      return (b.lists as unknown[]).flatMap((item) => {
        if (typeof item !== 'object' || item === null) {
          return [];
        }
        const normalized = normalizeWekanListRecord(item as Record<string, unknown>, readWekanId(b._id));
        return normalized != null ? [normalized] : [];
      });
    });
    const nestedCards = boardObjects.flatMap((b) => {
      if (!Array.isArray(b.cards)) {
        return [];
      }
      return (b.cards as unknown[]).flatMap((item) => {
        if (typeof item !== 'object' || item === null) {
          return [];
        }
        const normalized = normalizeWekanCardRecord(item as Record<string, unknown>, readWekanId(b._id));
        return normalized != null ? [normalized] : [];
      });
    });
    const out: WekanExport = {
      boards: normalizedBoards,
      lists:
        Array.isArray(o.lists) && o.lists.length > 0
          ? (o.lists as unknown[])
              .flatMap((item) => {
                if (typeof item !== 'object' || item === null) {
                  return [];
                }
                const normalized = normalizeWekanListRecord(item as Record<string, unknown>);
                return normalized != null ? [normalized] : [];
              })
          : nestedLists,
      cards:
        Array.isArray(o.cards) && o.cards.length > 0
          ? (o.cards as unknown[])
              .flatMap((item) => {
                if (typeof item !== 'object' || item === null) {
                  return [];
                }
                const normalized = normalizeWekanCardRecord(item as Record<string, unknown>);
                return normalized != null ? [normalized] : [];
              })
          : nestedCards,
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    if (normalizedBoards.length !== 1) {
      throw new Error('Wekan import: only single-board exports are supported.');
    }
    return normalizeWekanExportData(out, {
      singleBoardIdHint: normalizedBoards[0]?._id,
    });
  }

  const hasBoardId = readWekanId(o._id) != null;
  const hasListsArray = Array.isArray(o.lists);
  const formatLooksLikeWekan =
    typeof o._format === 'string' && o._format.toLowerCase().includes('wekan');

  if (hasBoardId && (hasListsArray || formatLooksLikeWekan)) {
    const singleBoard = normalizeWekanBoardRecord(stripToWekanBoard(o) as unknown as Record<string, unknown>);
    if (singleBoard == null) {
      throw new Error('Wekan import: invalid single-board payload.');
    }
    const out: WekanExport = {
      boards: [singleBoard],
      lists: hasListsArray ? (o.lists as WekanList[]) : [],
      cards: Array.isArray(o.cards) ? (o.cards as WekanCard[]) : [],
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    return normalizeWekanExportData(out, { singleBoardIdHint: singleBoard._id });
  }

  throw new Error(
    'Wekan import: unrecognized JSON. Expected a single-board Wekan export (root _id/title with lists/cards) or a compatible { board, lists, cards } wrapper.'
  );
}

export async function importWekan(
  jsonData: unknown,
  userId: string,
  defaultUncolouredCardColour?: string,
  preflight?: ImportPreflightPayloadParsed,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days, matches ImportJob TTL
  const importJob = new ImportJob({
    userId,
    type: 'wekan',
    status: 'processing',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    importErrors: [],
    expiresAt,
  });

  await importJob.save();
  const jobId = importJob._id.toString();

  try {
    const data = normalizeWekanExport(jsonData);
    const decisionBySourceUserId = new Map(
      (preflight?.userDecisions ?? []).map((d) => [d.sourceUserId, d]),
    );
    const replacementByIconSrc = new Map(
      (preflight?.inlineButtonIconReplacements ?? []).map((r) => [r.iconSrc.trim(), r.replacementDataUrl]),
    );
    const localizedByIconSrc = await buildLocalizedInlineIconMap(
      extractLegacyInlineButtonCandidates(data.cards),
    );
    const unmappedPolicy = preflight?.unmappedUserPolicy ?? 'map_to_importer';

    if (data.boards.length === 0) {
      throw new Error('Wekan import: no boards found in file.');
    }

    // Map Wekan users to application users (decision -> auto-match -> policy fallback)
    const userMap = new Map<string, string>();
    const placeholderByEmail = new Map<string, string>();
    if (data.users) {
      for (const wekanUser of data.users) {
        const decision = decisionBySourceUserId.get(wekanUser._id);
        let matchedUser: (typeof User) | null = null;
        const email = wekanUser.emails?.[0]?.address;
        if (email) {
          matchedUser = await User.findOne({ email });
        }
        if (!matchedUser && wekanUser.username) {
          matchedUser = await User.findOne({ username: wekanUser.username });
        }
        if (!matchedUser && wekanUser.profile?.fullname) {
          matchedUser = await User.findOne({ displayName: wekanUser.profile.fullname });
        }

        const autoMatchedUserId = matchedUser
          ? (matchedUser as unknown as { _id: { toString: () => string } })._id.toString()
          : undefined;
        const resolution = resolveImportUserResolution({
          ...(decision != null ? { decision } : {}),
          ...(autoMatchedUserId != null ? { autoMatchedUserId } : {}),
          policy: unmappedPolicy,
          importerUserId: userId,
        });
        if (resolution.kind === 'discard') {
          continue;
        }
        if (resolution.kind === 'map') {
          userMap.set(wekanUser._id, resolution.userId);
          continue;
        }

        // create_placeholder fallback
        const normalizedEmail = normalizeKey(email);
        const existingPlaceholderId =
          normalizedEmail !== '' ? placeholderByEmail.get(normalizedEmail) : undefined;
        if (existingPlaceholderId) {
          userMap.set(wekanUser._id, existingPlaceholderId);
          continue;
        }
        const placeholderUser = new User({
          email: email || `placeholder-${wekanUser._id}@wekan.import`,
          username: wekanUser.username || `wekan_${wekanUser._id}`,
          displayName: wekanUser.profile?.fullname || wekanUser.username || 'Imported User',
          passwordHash: undefined,
          emailVerified: false,
          isPlaceholder: true,
          placeholderSource: 'wekan',
          placeholderEmail: email,
          placeholderName: wekanUser.profile?.fullname || wekanUser.username,
          preferences: {
            theme: 'light',
            notifications: true,
            language: 'en',
            notificationPreferences: {},
          },
        });
        await placeholderUser.save();
        const placeholderId = placeholderUser._id.toString();
        userMap.set(wekanUser._id, placeholderId);
        if (normalizedEmail !== '') {
          placeholderByEmail.set(normalizedEmail, placeholderId);
        }
      }
    }

    // Import boards - each Wekan board becomes a workspace with one board
    const workspaceMap = new Map<string, string>();
    const boardMap = new Map<string, string>();
    const boardWipLimitMap = new Map<string, number>();
    for (const list of data.lists) {
      if (typeof list.wipLimit === 'number' && Number.isFinite(list.wipLimit) && list.wipLimit > 0) {
        const prev = boardWipLimitMap.get(list.boardId) ?? 0;
        boardWipLimitMap.set(list.boardId, Math.max(prev, Math.floor(list.wipLimit)));
      }
    }
    let processed = 0;
    let importedBoardCount = 0;
    let importedListCount = 0;
    let importedCardCount = 0;
    let lastEmittedProgress = 0;
    const totalItems =
      data.boards.length + data.lists.length + data.cards.length;

    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems,
    });

    for (const wekanBoard of data.boards) {
      try {
        // Create workspace for each Wekan board
        const workspaceTitleBase =
          sanitizeImportedPlainText(wekanBoard.title) || `Imported from Wekan - ${wekanBoard._id}`;
        const workspaceDescriptionRaw =
          typeof wekanBoard.description === 'string'
            ? sanitizeImportedDescriptionText(wekanBoard.description)
            : '';
        const workspace = new Workspace({
          name: workspaceTitleBase.slice(0, 100),
          description:
            workspaceDescriptionRaw.length > 0
              ? workspaceDescriptionRaw.slice(0, 500)
              : undefined,
          ownerId: userId,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'private',
          members: [],
        });
        await workspace.save();
        workspaceMap.set(wekanBoard._id, workspace._id.toString());

        // Create board within workspace
        const sanitizedBoardName =
          sanitizeImportedPlainText(wekanBoard.title) || `Imported board ${wekanBoard._id}`;
        const rawWekanBoardDesc =
          typeof wekanBoard.description === 'string' && wekanBoard.description.length > 0
            ? sanitizeImportedDescriptionText(wekanBoard.description)
            : undefined;
        const board = new Board({
          workspaceId: workspace._id.toString(),
          name: sanitizedBoardName.slice(0, BOARD_NAME_MAX_LENGTH),
          description:
            rawWekanBoardDesc !== undefined
              ? rawWekanBoardDesc.slice(0, BOARD_DESCRIPTION_MAX_LENGTH)
              : undefined,
          background: wekanBoard.background,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'workspace',
          ownerId: userId,
          members: (() => {
            const seen = new Set<string>();
            const out: Array<{ userId: mongoose.Types.ObjectId; roleKey: string; addedAt: Date }> = [
              {
                userId: new mongoose.Types.ObjectId(userId),
                roleKey: 'admin',
                addedAt: new Date(),
              },
            ];
            seen.add(userId);
            for (const member of wekanBoard.members || []) {
              const mapped = userMap.get(member.userId) || userId;
              if (seen.has(mapped)) {
                continue;
              }
              seen.add(mapped);
              out.push({
                userId: new mongoose.Types.ObjectId(mapped),
                roleKey: mapWekanBoardMemberToBoardRoleKey(member),
                addedAt: new Date(),
              });
            }
            return out;
          })(),
          settings: {
            allowComments: true,
            allowAttachments: true,
            cardCoverImages: true,
            ...(boardWipLimitMap.get(wekanBoard._id) !== undefined
              ? {
                  listMaxCards: boardWipLimitMap.get(wekanBoard._id),
                  listEnforceMaxCards: true,
                }
              : {}),
          },
        });
        await board.save();
        boardMap.set(wekanBoard._id, board._id.toString());
        importedBoardCount++;

        processed++;
        const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress,
          processedItems: processed,
        });

        // Emit Socket.io progress every 10 items
        if (processed - lastEmittedProgress >= 10) {
          emitToUser(userId, 'import:progress', {
            jobId,
            progress,
            itemsProcessed: processed,
            totalItems,
          });
          lastEmittedProgress = processed;
        }
      } catch (error) {
        logger.error({ error, boardId: wekanBoard._id }, 'Error importing Wekan board');
        processed++;
      }
    }

    // Import labels
    const labelMap = new Map<string, { id: string; name: string; color: string }>();
    if (data.labels) {
      for (const wekanLabel of data.labels) {
        try {
          const boardId = boardMap.get(wekanLabel.boardId);
          if (!boardId) continue;

          const label = new BoardLabel({
            boardId,
            name: wekanLabel.name || 'Unnamed',
            color: normalizeImportedColour(wekanLabel.color) ?? '#61BD4F',
            isPredefined: false,
            createdBy: userId,
          });
          await label.save();
          labelMap.set(wekanLabel._id, {
            id: label._id.toString(),
            name: label.name,
            color: label.color,
          });
        } catch (error) {
          logger.error({ error, labelId: wekanLabel._id }, 'Error importing Wekan label');
        }
      }
    }

    // Import lists
    const listMap = new Map<string, string>();
    for (const wekanList of data.lists) {
      try {
        const boardId = boardMap.get(wekanList.boardId);
        if (!boardId) continue;

        const sanitizedListName = sanitizeImportedPlainText(wekanList.title) || 'Untitled list';
        const list = new List({
          boardId,
          name: sanitizedListName.slice(0, LIST_NAME_MAX_LENGTH),
          position: wekanList.sort || 0,
          ...(normalizeImportedColour(wekanList.color) !== undefined
            ? { color: normalizeImportedColour(wekanList.color) }
            : {}),
        });
        await list.save();
        listMap.set(wekanList._id, list._id.toString());
        importedListCount++;

        processed++;
        const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress,
          processedItems: processed,
        });

        // Emit Socket.io progress every 10 items
        if (processed - lastEmittedProgress >= 10) {
          emitToUser(userId, 'import:progress', {
            jobId,
            progress,
            itemsProcessed: processed,
            totalItems,
          });
          lastEmittedProgress = processed;
        }
      } catch (error) {
        logger.error({ error, listId: wekanList._id }, 'Error importing Wekan list');
        processed++;
      }
    }

    // Import cards (bulk insertMany in batches, same pattern as Trello import)
    const checklistsByCardId = groupWekanRowsByCardId(data.checklists);
    const commentsByCardId = groupWekanRowsByCardId(data.comments);
    const attachmentsByCardId = groupWekanRowsByCardId(data.attachments);
    const cardInsertCtx: WekanCardInsertContext = {
      listMap,
      boardMap,
      userMap,
      labelMap,
      checklistsByCardId,
      commentsByCardId,
      attachmentsByCardId,
      replacementByIconSrc,
      localizedByIconSrc,
      defaultUncolouredCardColour,
      userId,
    };

    const cardInsertBuffer: Record<string, unknown>[] = [];
    const flushCardInsertBuffer = async (): Promise<void> => {
      if (cardInsertBuffer.length === 0) {
        return;
      }
      const chunk = cardInsertBuffer.splice(0, WEKAN_CARD_INSERT_BATCH);
      try {
        await Card.insertMany(chunk, { ordered: true });
        importedCardCount += chunk.length;
      } catch (error) {
        logger.error({ error, batchSize: chunk.length }, 'Error bulk-importing Wekan cards');
        throw error;
      }
    };

    for (const wekanCard of data.cards) {
      processed++;
      const doc = buildWekanCardInsertPlainObject(wekanCard, cardInsertCtx);
      if (doc != null) {
        cardInsertBuffer.push(doc);
      }
      while (cardInsertBuffer.length >= WEKAN_CARD_INSERT_BATCH) {
        await flushCardInsertBuffer();
      }

      const progress = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0;
      await ImportJob.findByIdAndUpdate(jobId, {
        progress,
        processedItems: processed,
        currentPhase: 'cards',
      });

      if (processed - lastEmittedProgress >= 10) {
        emitToUser(userId, 'import:progress', {
          jobId,
          progress,
          itemsProcessed: processed,
          totalItems,
          phase: 'cards',
        });
        lastEmittedProgress = processed;
      }
    }

    while (cardInsertBuffer.length > 0) {
      await flushCardInsertBuffer();
    }

    const firstBoardForActivity = data.boards[0];
    const firstBoardIdForActivity =
      firstBoardForActivity != null ? boardMap.get(firstBoardForActivity._id) : undefined;
    if (firstBoardIdForActivity != null && importedCardCount > 0) {
      createActivity({
        boardId: firstBoardIdForActivity,
        userId,
        type: 'import.completed',
        description: `Wekan import: ${importedCardCount} cards, ${importedListCount} lists`,
        metadata: { source: 'wekan', jobId },
      });
    }

    const firstBoard = data.boards[0];
    const firstBoardId = firstBoard != null ? boardMap.get(firstBoard._id) : undefined;
    const firstWorkspaceId =
      firstBoard != null ? workspaceMap.get(firstBoard._id) : undefined;
    const completionResult = {
      message: 'Import completed successfully',
      importedCount: importedBoardCount + importedListCount + importedCardCount,
      boardCount: importedBoardCount,
      listCount: importedListCount,
      cardCount: importedCardCount,
      ...(firstWorkspaceId != null ? { workspaceId: new mongoose.Types.ObjectId(firstWorkspaceId) } : {}),
      ...(firstBoardId != null ? { boardId: new mongoose.Types.ObjectId(firstBoardId) } : {}),
      ...(firstBoard?.title != null ? { boardName: firstBoard.title.slice(0, BOARD_NAME_MAX_LENGTH) } : {}),
    };

    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: totalItems,
      result: completionResult,
    });

    // Emit final completion event
    emitToUser(userId, 'import:completed', {
      jobId,
      result: completionResult,
    });

    logger.info({ jobId, userId }, 'Wekan import completed');
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Wekan import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
    });

    // Emit error event
    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

