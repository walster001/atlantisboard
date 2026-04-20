import mongoose from 'mongoose';
import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card, type ICard } from '../../models/Card.js';
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
import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import { resolveImportUserResolution } from '../../../shared/import/importUserResolution.js';
import { uploadBrandingAsset } from '../brandingService.js';
import { resolveImportedCardColour } from '../../../shared/utils/importDefaultCardColour.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
} from '../../../shared/constants/entityTextLimits.js';
import crypto from 'node:crypto';

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
  }>;
}

interface WekanList {
  _id: string;
  title: string;
  boardId: string;
  sort: number;
  archived: boolean;
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

const LEGACY_INLINE_BUTTON_RE =
  /<span[^>]*display\s*:\s*inline-flex[^>]*>\s*<img[^>]*src=['"]([^'"]+)['"][^>]*>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/span>/gi;

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

function wekanDescriptionToCardJson(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, string>,
  localizedByIconSrc: ReadonlyMap<string, string>,
): string {
  if (description.trim() === '') {
    return '';
  }
  const nodes: Array<Record<string, unknown>> = [];
  let cursor = 0;
  LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
  let match: RegExpExecArray | null = LEGACY_INLINE_BUTTON_RE.exec(description);
  while (match != null) {
    const [full, rawIconSrc, rawHref, rawButtonText] = match;
    const before = description.slice(cursor, match.index);
    nodes.push(...plainTextParagraphNodes(before));

    const iconSrc = decodeHtmlEntities((rawIconSrc ?? '').trim());
    const href = decodeHtmlEntities((rawHref ?? '').trim());
    const buttonText = decodeHtmlEntities((rawButtonText ?? '').replace(/\s+/g, ' ').trim());
    const inlineButton = buildTrelloImportInlineButton(href, buttonText);
    if (inlineButton != null) {
      const replacement = replacementByIconSrc.get(iconSrc);
      const localized = localizedByIconSrc.get(iconSrc);
      const attrs = {
        ...inlineButton.attrs,
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
      nodes.push(...plainTextParagraphNodes(full));
    }

    cursor = match.index + full.length;
    match = LEGACY_INLINE_BUTTON_RE.exec(description);
  }
  const tail = description.slice(cursor);
  nodes.push(...plainTextParagraphNodes(tail));

  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  return JSON.stringify({
    type: 'doc',
    content: nodes,
  });
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
      const localUrl = await uploadBrandingAsset(
        buffer,
        contentType,
        'board-nav-icon',
        iconSrc.split('/').pop(),
      );
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
    return normalizeWekanExport({
      ...rest,
      boards: [board as Record<string, unknown>],
    });
  }

  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const out: WekanExport = {
      boards: o.boards as WekanBoard[],
      lists: Array.isArray(o.lists) ? (o.lists as WekanList[]) : [],
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
    return out;
  }

  const hasBoardId = typeof o._id === 'string';
  const hasListsArray = Array.isArray(o.lists);
  const formatLooksLikeWekan =
    typeof o._format === 'string' && o._format.toLowerCase().includes('wekan');

  if (hasBoardId && (hasListsArray || formatLooksLikeWekan)) {
    const out: WekanExport = {
      boards: [stripToWekanBoard(o)],
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
    return out;
  }

  throw new Error(
    'Wekan import: unrecognized JSON. Expected a "boards" array, a single-board export (with _id and lists or _format wekan-board), or a { board, lists, cards } style wrapper.'
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
    let lastEmittedProgress = 0;
    const totalItems =
      data.boards.length + data.lists.length + data.cards.length;

    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems,
    });

    for (const wekanBoard of data.boards) {
      try {
        // Create workspace for each Wekan board
        const workspaceTitleBase = wekanBoard.title || `Imported from Wekan - ${wekanBoard._id}`;
        const workspace = new Workspace({
          name: workspaceTitleBase.slice(0, 100),
          description:
            typeof wekanBoard.description === 'string' && wekanBoard.description.length > 0
              ? wekanBoard.description.slice(0, 500)
              : undefined,
          ownerId: userId,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'private',
          members: [],
        });
        await workspace.save();
        workspaceMap.set(wekanBoard._id, workspace._id.toString());

        // Create board within workspace
        const rawWekanBoardDesc =
          typeof wekanBoard.description === 'string' && wekanBoard.description.length > 0
            ? wekanBoard.description
            : undefined;
        const board = new Board({
          workspaceId: workspace._id.toString(),
          name: wekanBoard.title.slice(0, BOARD_NAME_MAX_LENGTH),
          description:
            rawWekanBoardDesc !== undefined
              ? rawWekanBoardDesc.slice(0, BOARD_DESCRIPTION_MAX_LENGTH)
              : undefined,
          background: wekanBoard.background,
          visibility: wekanBoard.permission === 'public' ? 'public' : 'workspace',
          ownerId: userId,
          members: (wekanBoard.members || []).map((member) => ({
            userId: new mongoose.Types.ObjectId(userMap.get(member.userId) || userId),
            roleKey: member.isAdmin ? 'admin' : 'viewer',
            addedAt: new Date(),
          })),
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
            color: wekanLabel.color || '#61BD4F',
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

        const list = new List({
          boardId,
          name: wekanList.title.slice(0, LIST_NAME_MAX_LENGTH),
          position: wekanList.sort || 0,
        });
        await list.save();
        listMap.set(wekanList._id, list._id.toString());

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

    // Import cards
    for (const wekanCard of data.cards) {
      try {
        const listId = listMap.get(wekanCard.listId);
        const boardId = boardMap.get(wekanCard.boardId);
        if (!listId || !boardId) continue;

        // Map labels
        const cardLabels = (wekanCard.labelIds || [])
          .map((labelId) => labelMap.get(labelId))
          .filter((meta): meta is { id: string; name: string; color: string } => meta !== undefined)
          .map((meta) => ({
            id: meta.id,
            name: meta.name,
            color: meta.color,
          }));

        // Map assignees
        const assigneeIds = (wekanCard.members || [])
          .map((memberId) => {
            const mappedId = userMap.get(memberId);
            return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
          })
          .filter((id): id is mongoose.Types.ObjectId => id !== null);

        // Map checklists
        const cardChecklists = (data.checklists || [])
          .filter((checklist) => checklist.cardId === wekanCard._id)
          .map((checklist) => ({
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

        // Map comments
        const cardComments = await Promise.all(
          (data.comments || [])
            .filter((comment) => comment.cardId === wekanCard._id)
            .map(async (comment): Promise<ICard['comments'][0]> => {
              const commentUserId = userMap.get(comment.userId);
              return {
                id: crypto.randomUUID(),
                userId: new mongoose.Types.ObjectId(commentUserId || userId),
                text: comment.text,
                createdAt: new Date(comment.createdAt),
                updatedAt: new Date(comment.modifiedAt || comment.createdAt),
              };
            })
        );

        // Map attachments (as placeholders)
        const cardAttachments = (data.attachments || [])
          .filter((attachment) => attachment.cardId === wekanCard._id)
          .map((attachment) => ({
            id: crypto.randomUUID(),
            name: (attachment.name || 'attachment').trim(),
            originalFileName: (attachment.name || 'attachment').trim(),
            url: '',
            isPlaceholder: true,
            type: attachment.type || 'unknown',
            size: attachment.size || 0,
            uploadedAt: new Date(attachment.uploadedAt),
            uploadedBy: new mongoose.Types.ObjectId(userMap.get(attachment.userId) || userId),
          }));

        const card = new Card({
          listId,
          boardId,
          title: wekanCard.title.slice(0, CARD_TITLE_MAX_LENGTH),
          description:
            typeof wekanCard.description === 'string' && wekanCard.description.trim() !== ''
              ? wekanDescriptionToCardJson(
                  wekanCard.description,
                  replacementByIconSrc,
                  localizedByIconSrc,
                )
              : undefined,
          position: wekanCard.sort || 0,
          color: resolveImportedCardColour(
            /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? wekanCard.cover : undefined,
            defaultUncolouredCardColour,
          ),
          cover: /^#[0-9A-Fa-f]{6}$/.test(wekanCard.cover || '') ? undefined : wekanCard.cover,
          labels: cardLabels,
          dueDate: wekanCard.dueAt ? new Date(wekanCard.dueAt) : undefined,
          startDate: wekanCard.startAt ? new Date(wekanCard.startAt) : undefined,
          completed: !!wekanCard.finishedAt,
          completedAt: wekanCard.finishedAt ? new Date(wekanCard.finishedAt) : undefined,
          createdBy: new mongoose.Types.ObjectId(userId),
          assignees: assigneeIds,
          reminders: [],
          attachments: cardAttachments,
          comments: cardComments,
          checklists: cardChecklists,
        });

        await card.save();

        // Create activity log
        createActivity({
          boardId,
          cardId: card._id.toString(),
          userId,
          type: 'card.created',
          description: `Card "${wekanCard.title}" imported from Wekan`,
        });

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
        logger.error({ error, cardId: wekanCard._id }, 'Error importing Wekan card');
        processed++;
      }
    }

    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      result: { message: 'Import completed successfully' },
    });

    // Emit final completion event
    emitToUser(userId, 'import:completed', {
      jobId,
      result: { message: 'Import completed successfully' },
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

