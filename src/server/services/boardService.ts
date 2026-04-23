import { Board, type IBoard } from '../models/Board.js';
import { deleteAllMongoAndStorageForBoardIds } from './boardScopedDeletion.js';
import { Workspace } from '../models/Workspace.js';
import { User } from '../models/User.js';
import {
  emitWorkspaceHomeSnapshotToUserById,
  emitWorkspaceHomeAccessRefreshForUser,
  getUserWorkspaces,
  getWorkspaceOwnerAndMemberUserIds,
} from './workspaceService.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { createActivity } from './activityService.js';
import {
  isBoardMember,
  hasPermission,
  isWorkspaceMember,
  userCanReorganizeWorkspaceHomeBoardBucket,
} from '../utils/permissions.js';
import type { BoardVisibility } from '../models/Board.js';
import type { Document } from 'mongoose';
import mongoose from 'mongoose';
import type { BoardSummaryDTO } from '../../shared/types/viewModels.js';
import { getBoardKanbanSnapshot } from './cardService.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../utils/socketIO.js';
import {
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
  type BoardMemberRoleUpdateModeKey,
} from './roleService.js';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsRemindersOnCards,
  boardShowsStartDateOnCards,
} from '../../shared/utils/boardCardDateVisibility.js';
import {
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeSettings,
} from '../../shared/boardTheme.js';

/** Monotonic counter for home `boards:positionsSynced` so clients can reject stale reorder events. */
let homeBoardPositionsSequence = 0;
function nextHomeBoardPositionsSequence(): number {
  homeBoardPositionsSequence += 1;
  return homeBoardPositionsSequence;
}

/**
 * `getUserWorkspaces(..., { view: 'detail' })` mixes member workspaces (Mongoose `_id`) and
 * board-only rows (`WorkspaceSummaryDTO` with `id` only). Reorder scope must accept both.
 */
function workspaceListEntryId(entry: unknown): string {
  if (entry == null || typeof entry !== 'object') {
    return '';
  }
  const e = entry as { id?: unknown; _id?: { toString(): string } };
  if (typeof e.id === 'string' && e.id.trim() !== '') {
    return e.id.trim();
  }
  if (e._id != null && typeof e._id.toString === 'function') {
    return e._id.toString();
  }
  return '';
}

function buildBoardSocketPayload(board: Document & IBoard): {
  boardId: string;
  data: Record<string, unknown>;
  serverTs: number;
} {
  return {
    boardId: board._id.toString(),
    data: board.toObject() as Record<string, unknown>,
    serverTs: Date.now(),
  };
}

/** Fan-out like change streams: board room, workspace, owner, each member (+ optional extra user rooms). */
export function emitBoardUpdatedRealtime(
  board: Document & IBoard,
  extraNotifyUserIds?: readonly string[],
): void {
  const payload = buildBoardSocketPayload(board);
  const boardId = payload.boardId;
  emitToBoard(boardId, 'board:updated', payload);
  const ws = board.workspaceId?.toString();
  if (ws) {
    emitToWorkspace(ws, 'board:updated', payload);
  }
  const ownerStr = board.ownerId.toString();
  emitToUser(ownerStr, 'board:updated', payload);
  for (const m of board.members) {
    const uid = m.userId.toString();
    if (uid !== ownerStr) {
      emitToUser(uid, 'board:updated', payload);
    }
  }
  if (extraNotifyUserIds != null) {
    for (const uid of extraNotifyUserIds) {
      if (uid !== ownerStr) {
        emitToUser(uid, 'board:updated', payload);
      }
    }
  }
}

/**
 * Home and other views listen on the global socket; clients always join `user:*`. Board room alone
 * misses users who have not opened that board, so duplicate `permissions.updated` to affected users.
 */
function emitBoardPermissionsUpdated(
  boardId: string,
  affectedUserIds: readonly string[],
  body: Record<string, unknown>,
): void {
  const serverTs = Date.now();
  const payload: Record<string, unknown> = {
    boardId,
    affectedUserIds,
    serverTs,
    ...body,
  };
  emitToBoard(boardId, 'permissions.updated', payload);
  const seen = new Set<string>();
  for (const raw of affectedUserIds) {
    const uid = raw.trim();
    if (uid !== '' && !seen.has(uid)) {
      seen.add(uid);
      emitToUser(uid, 'permissions.updated', payload);
    }
  }
}

async function resolveBoardActorRoleKey(board: Document & IBoard, userId: string): Promise<string | null> {
  if (board.ownerId.toString() === userId) {
    return 'admin';
  }
  const boardMember = board.members.find((m) => m.userId.toString() === userId);
  if (boardMember != null && typeof boardMember.roleKey === 'string' && boardMember.roleKey.trim() !== '') {
    return boardMember.roleKey;
  }
  const workspace = await Workspace.findById(board.workspaceId)
    .select('ownerId members')
    .lean()
    .catch(() => null);
  if (workspace == null) {
    return null;
  }
  if (workspace.ownerId?.toString() === userId) {
    return 'admin';
  }
  const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
    (m) => String(m.userId) === userId,
  );
  if (typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== '') {
    return wsMember.roleKey.trim();
  }
  return null;
}

async function resolveBoardRoleUpdateModeForActor(
  userId: string,
  boardId: string,
): Promise<BoardMemberRoleUpdateModeKey | null> {
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.any')) {
    return 'boards.members.role.update.any';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samehigher')) {
    return 'boards.members.role.update.samehigher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samelower')) {
    return 'boards.members.role.update.samelower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.higher')) {
    return 'boards.members.role.update.higher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.lower')) {
    return 'boards.members.role.update.lower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.same')) {
    return 'boards.members.role.update.same';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update')) {
    // Backward-compatible default for legacy roles with coarse update key.
    return 'boards.members.role.update.samelower';
  }
  return null;
}

function emitBoardCreatedRealtime(board: Document & IBoard): void {
  const payload = buildBoardSocketPayload(board);
  const boardId = payload.boardId;
  emitToBoard(boardId, 'board:created', payload);
  const ws = board.workspaceId?.toString();
  if (ws) {
    emitToWorkspace(ws, 'board:created', payload);
  }
  emitToUser(board.ownerId.toString(), 'board:created', payload);
}

export interface CreateBoardInput {
  workspaceId: string;
  name: string;
  description?: string | undefined;
  background?: string | undefined;
  themeSettings?: BoardThemeSettings | undefined;
  visibility?: BoardVisibility | undefined;
  ownerId: string;
}

export interface UpdateBoardInput {
  workspaceId?: string | null | undefined;
  name?: string | undefined;
  description?: string | undefined;
  background?: string | undefined;
  themeSettings?: BoardThemeSettings | undefined;
  visibility?: BoardVisibility | undefined;
  settings?: {
    allowComments?: boolean | undefined;
    allowAttachments?: boolean | undefined;
    cardCoverImages?: boolean | undefined;
    showDueDateAndReminders?: boolean | undefined;
    showRemindersOnCards?: boolean | undefined;
    showStartDateOnCards?: boolean | undefined;
    showDueDateOnCards?: boolean | undefined;
    showEndDateOnCards?: boolean | undefined;
    showLabels?: boolean | undefined;
    showAssignees?: boolean | undefined;
    showChecklist?: boolean | undefined;
    showAttachments?: boolean | undefined;
    showComments?: boolean | undefined;
    showListCardCount?: boolean | undefined;
    showCardDescriptionPreview?: boolean | undefined;
    listMaxCards?: number | undefined;
    listEnforceMaxCards?: boolean | undefined;
    listColumnWidthAuto?: boolean | undefined;
    listColumnWidthPx?: number | undefined;
    memberActivityLogRetentionDays?: number | null | undefined;
  } | undefined;
}

export type BoardViewMode = 'summary' | 'detail';

/** Optional pagination for board list endpoints (`skip` defaults to 0 when `limit` is set). */
export interface BoardListQueryOptions {
  view?: BoardViewMode | undefined;
  skip?: number | undefined;
  limit?: number | undefined;
}

export interface BoardMemberListItem {
  userId: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  role: 'owner' | 'member';
  roleKey: string;
  addedAt?: Date;
}

export interface BoardMemberListResult {
  members: BoardMemberListItem[];
  nextCursor?: string;
}

function toBoardSummary(board: Document & IBoard): BoardSummaryDTO {
  const s = board.settings;
  return {
    id: board._id.toString(),
    ...(board.workspaceId ? { workspaceId: board.workspaceId.toString() } : {}),
    position: board.position,
    name: board.name,
    ...(board.description !== undefined ? { description: board.description } : {}),
    ...(board.background !== undefined ? { background: board.background } : {}),
    ...(board.themeSettings !== undefined ? { themeSettings: board.themeSettings } : {}),
    visibility: board.visibility,
    ownerId: board.ownerId.toString(),
    members: board.members.map((member) => ({
      userId: member.userId.toString(),
      roleKey: member.roleKey,
      addedAt: member.addedAt,
    })),
    settings: {
      allowComments: s.allowComments !== false,
      allowAttachments: s.allowAttachments !== false,
      cardCoverImages: s.cardCoverImages !== false,
      showRemindersOnCards: boardShowsRemindersOnCards(s),
      showStartDateOnCards: boardShowsStartDateOnCards(s),
      showDueDateOnCards: boardShowsDueDateOnCards(s),
      showEndDateOnCards: boardShowsEndDateOnCards(s),
      showLabels: s.showLabels !== false,
      showAssignees: s.showAssignees !== false,
      showChecklist: s.showChecklist !== false,
      showAttachments: s.showAttachments !== false,
      showComments: s.showComments !== false,
      showListCardCount: s.showListCardCount !== false,
      showCardDescriptionPreview: s.showCardDescriptionPreview !== false,
      ...(typeof s.listMaxCards === 'number' && !Number.isNaN(s.listMaxCards)
        ? { listMaxCards: s.listMaxCards }
        : {}),
      ...(s.listEnforceMaxCards !== undefined ? { listEnforceMaxCards: s.listEnforceMaxCards } : {}),
      ...(s.listColumnWidthAuto !== undefined ? { listColumnWidthAuto: s.listColumnWidthAuto } : {}),
      ...(typeof s.listColumnWidthPx === 'number' && !Number.isNaN(s.listColumnWidthPx)
        ? { listColumnWidthPx: s.listColumnWidthPx }
        : {}),
      ...(typeof s.memberActivityLogRetentionDays === 'number' &&
      !Number.isNaN(s.memberActivityLogRetentionDays)
        ? { memberActivityLogRetentionDays: s.memberActivityLogRetentionDays }
        : {}),
    },
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

/** Optional display name from the HTTP layer to avoid an extra User read on hot paths. */
export interface BoardMemberAuditHints {
  readonly targetDisplayName?: string;
}

async function resolveTargetDisplayNameForAudit(
  userId: string,
  hints?: BoardMemberAuditHints,
): Promise<string> {
  const fromHint = hints?.targetDisplayName?.trim();
  if (fromHint !== undefined && fromHint !== '') {
    return fromHint;
  }
  const user = await User.findById(userId).select('displayName').lean();
  return user?.displayName ?? 'Unknown user';
}

/** ObjectId string for queries; supports raw ObjectId or populated User subdocs (not `doc.toString()`). */
function extractRefUserIdString(ref: unknown): string {
  if (ref == null) {
    return '';
  }
  if (typeof ref === 'string') {
    return ref;
  }
  if (ref instanceof mongoose.Types.ObjectId) {
    return ref.toHexString();
  }
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return extractRefUserIdString((ref as { _id: unknown })._id);
  }
  const asString = String(ref);
  if (/^[a-f0-9]{24}$/i.test(asString)) {
    return asString;
  }
  return '';
}

export async function getBoardMembersPage(
  boardId: string,
  userId: string,
  options?: {
    q?: string;
    sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
    cursor?: string;
    limit?: number;
  }
): Promise<BoardMemberListResult | null> {
  const board = await getBoardById(boardId, userId, { view: 'detail' });
  if (!board || !('_id' in board)) {
    return null;
  }

  const ownerUserId = extractRefUserIdString(board.ownerId);
  const memberUserIds = board.members.map((member) => extractRefUserIdString(member.userId));
  const allUserIds = Array.from(
    new Set([ownerUserId, ...memberUserIds].filter((id) => id !== ''))
  );
  const users = await User.find({ _id: { $in: allUserIds } })
    .select('_id displayName email profilePicture')
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  let rows: BoardMemberListItem[] = [
    (() => {
      const owner = byId.get(ownerUserId);
      return {
        userId: ownerUserId,
        displayName: owner?.displayName ?? 'Unknown user',
        email: owner?.email ?? '',
        ...(owner?.profilePicture !== undefined ? { profilePicture: owner.profilePicture } : {}),
        role: 'owner' as const,
        roleKey: 'admin',
      };
    })(),
    ...board.members
      .filter((member) => extractRefUserIdString(member.userId) !== ownerUserId)
      .map((member) => {
        const id = extractRefUserIdString(member.userId);
        const user = id !== '' ? byId.get(id) : undefined;
        return {
          userId: id,
          displayName: user?.displayName ?? 'Unknown user',
          email: user?.email ?? '',
          ...(user?.profilePicture !== undefined ? { profilePicture: user.profilePicture } : {}),
          role: 'member' as const,
          roleKey: member.roleKey,
          addedAt: member.addedAt,
        };
      }),
  ];

  const q = options?.q?.trim().toLowerCase();
  if (q !== undefined && q !== '') {
    rows = rows.filter(
      (row) => row.displayName.toLowerCase().includes(q) || row.email.toLowerCase().includes(q)
    );
  }

  const sort = options?.sort ?? 'displayName:asc';
  rows.sort((a, b) => {
    const [field, dir] = sort.split(':') as ['displayName' | 'email', 'asc' | 'desc'];
    const base =
      field === 'email'
        ? a.email.localeCompare(b.email, undefined, { sensitivity: 'base' })
        : a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    if (base !== 0) {
      return dir === 'desc' ? -base : base;
    }
    return a.userId.localeCompare(b.userId);
  });

  const start = decodeCursor(options?.cursor);
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const end = start + limit;
  const page = rows.slice(start, end);
  return {
    members: page,
    ...(end < rows.length ? { nextCursor: encodeCursor(end) } : {}),
  };
}

let boardLegacyPositionBackfillDone = false;

async function ensureLegacyBoardPositions(): Promise<void> {
  if (boardLegacyPositionBackfillDone) {
    return;
  }
  boardLegacyPositionBackfillDone = true;
  const res = await Board.updateMany(
    { $or: [{ position: { $exists: false } }, { position: null }] },
    { $set: { position: 0 } }
  );
  if (res.modifiedCount > 0) {
    logger.info({ modifiedCount: res.modifiedCount }, 'Backfilled board.position for legacy documents');
  }
}

async function listBoardsInHomeScopeForReorder(
  userId: string,
  workspaceId: string
): Promise<(Document & IBoard)[]> {
  const visibleWorkspaces = await getUserWorkspaces(userId, { view: 'detail' });
  const widTrimmed = workspaceId.trim();
  if (!visibleWorkspaces.some((ws) => workspaceListEntryId(ws) === widTrimmed)) {
    return [];
  }
  const allVisible = await getUserBoards(userId, undefined, { view: 'detail' });
  const allVisibleDocs = allVisible.filter(
    (board): board is Document & IBoard => '_id' in board
  );
  const scoped = allVisibleDocs.filter(
    (board) =>
      board.workspaceId != null && board.workspaceId.toString() === widTrimmed,
  );
  scoped.sort((a, b) => {
    const ap = typeof a.position === 'number' && !Number.isNaN(a.position) ? a.position : 0;
    const bp = typeof b.position === 'number' && !Number.isNaN(b.position) ? b.position : 0;
    if (ap !== bp) {
      return ap - bp;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return scoped;
}

/** Home reorder mutates `position` for every visible board in the row — align with client `canReorderAllBoardsInScope`. */
async function userCanEditBoardDoc(userId: string, board: Document & IBoard): Promise<boolean> {
  if (board.ownerId.toString() === userId) {
    return true;
  }
  const boardId = board._id.toString();
  const user = { id: userId };
  return (
    (await hasPermission(user, boardId, 'boards.reorder_in_home')) ||
    (await hasPermission(user, boardId, 'boards.update'))
  );
}

/**
 * Persist home-page order within one workspace (boards the user can see in that workspace).
 * Caller must send every board id in that scope, in the new order.
 */
export async function reorderBoardsInHomeScope(
  userId: string,
  workspaceId: string,
  orderedBoardIds: readonly string[]
): Promise<void> {
  await ensureLegacyBoardPositions();

  const wid = workspaceId.trim();
  const normalizedIds = orderedBoardIds.map((id) => id.trim()).filter((id) => id.length > 0);

  const boardsInScope = await listBoardsInHomeScopeForReorder(userId, wid);
  const expectedIds = new Set(boardsInScope.map((b) => b._id.toString()));
  const got = new Set(normalizedIds);

  if (expectedIds.size !== got.size || !normalizedIds.every((id) => expectedIds.has(id))) {
    throw new Error('Invalid board order for this workspace');
  }

  for (const b of boardsInScope) {
    if (!(await userCanEditBoardDoc(userId, b))) {
      throw new Error('Insufficient permissions to reorder boards in this workspace');
    }
  }

  const bulk = normalizedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      update: { $set: { position: index } },
    },
  }));

  if (bulk.length > 0) {
    await Board.bulkWrite(bulk);
  }

  logger.info(
    { userId, workspaceId: wid, boardCount: bulk.length },
    'Workspace home row: board position indices saved (0..n-1 on each Board.position)',
  );

  const updated = await Board.find({
    _id: { $in: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  const serverTs = Date.now();
  const sequence = nextHomeBoardPositionsSequence();
  const positionsPayload = {
    workspaceId: wid,
    orderedBoardIds: [...normalizedIds],
    serverTs,
    sequence,
  };
  emitToWorkspace(wid, 'boards:positionsSynced', positionsPayload);
  const notifyUserIds = new Set<string>();
  for (const b of updated) {
    notifyUserIds.add(b.ownerId.toString());
    for (const m of b.members) {
      notifyUserIds.add(m.userId.toString());
    }
  }
  const workspaceAudience = await getWorkspaceOwnerAndMemberUserIds(wid);
  for (const uid of workspaceAudience) {
    notifyUserIds.add(uid);
  }
  for (const id of normalizedIds) {
    emitToBoard(id, 'boards:positionsSynced', positionsPayload);
  }
  for (const uid of notifyUserIds) {
    emitToUser(uid, 'boards:positionsSynced', positionsPayload);
  }

  logAuditEvent({
    userId,
    action: 'board.reorder.home',
    resourceType: 'board',
    resourceId: normalizedIds[0] ?? 'batch',
    metadata: { workspaceId: wid, count: bulk.length },
    timestamp: new Date(),
  });
}

export async function createBoard(input: CreateBoardInput): Promise<Document & IBoard> {
  await ensureLegacyBoardPositions();

  if (!(await hasPermission(input.ownerId, input.workspaceId, 'boards.create', 'workspace'))) {
    throw new Error('Insufficient permissions to create a board in this workspace');
  }

  const workspace = await Workspace.findById(input.workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const wid = new mongoose.Types.ObjectId(input.workspaceId);
  const last = await Board.findOne({ workspaceId: wid })
    .sort({ position: -1 })
    .select('position')
    .lean();
  const position = (typeof last?.position === 'number' ? last.position : -1) + 1;

  const board = new Board({
    workspaceId: input.workspaceId,
    position,
    name: input.name,
    description: input.description,
    background: undefined,
    themeSettings: normalizeBoardThemeSettings(
      input.themeSettings,
      createDefaultBoardThemeSettings(),
    ),
    visibility: input.visibility || 'private',
    ownerId: input.ownerId,
    members: [],
    settings: {
      allowComments: true,
      allowAttachments: true,
      cardCoverImages: true,
      showDueDateAndReminders: true,
      showRemindersOnCards: true,
      showLabels: true,
      showAssignees: true,
      showChecklist: true,
      showAttachments: true,
      showComments: true,
      showListCardCount: true,
      showCardDescriptionPreview: true,
    },
  });

  if (input.background !== undefined) {
    board.background = input.background;
  } else if (board.themeSettings != null) {
    const resolvedBackground = resolveBoardBackgroundFromThemeSettings(board.themeSettings);
    if (resolvedBackground !== undefined) {
      board.background = resolvedBackground;
    }
  }

  await board.save();

  logAuditEvent({
    userId: input.ownerId,
    action: 'board.create',
    resourceType: 'board',
    resourceId: board._id.toString(),
    metadata: { workspaceId: input.workspaceId },
    timestamp: new Date(),
  });

  logger.info({ boardId: board._id.toString(), ownerId: input.ownerId }, 'Board created');
  emitBoardCreatedRealtime(board);
  return board;
}

export async function getBoardById(
  boardId: string,
  userId: string,
  options?: { view?: BoardViewMode }
): Promise<((Document & IBoard) | BoardSummaryDTO) | null> {
  const view = options?.view ?? 'detail';
  const boardQuery = Board.findById(boardId);
  if (view === 'detail') {
    boardQuery
      .populate('ownerId', 'displayName email profilePicture')
      .populate('members.userId', 'displayName email profilePicture');
  }
  const board = await boardQuery;
  if (!board) {
    return null;
  }

  // Check access
  if (board.ownerId.toString() === userId) {
    return view === 'summary' ? toBoardSummary(board) : board;
  }

  if (await isBoardMember(userId, boardId)) {
    return view === 'summary' ? toBoardSummary(board) : board;
  }

  if (board.visibility === 'public') {
    return view === 'summary' ? toBoardSummary(board) : board;
  }

  return null;
}

export async function getUserBoards(
  userId: string,
  workspaceId?: string,
  options?: BoardListQueryOptions
): Promise<Array<(Document & IBoard) | BoardSummaryDTO>> {
  await ensureLegacyBoardPositions();

  // If workspaceId is provided, filter by workspace
  if (workspaceId) {
    return getBoardsByWorkspace(workspaceId, userId, options);
  }

  // Workspaces where the user is owner or workspace member: include every board in those workspaces.
  // Board-only membership (not a workspace member) must NOT expand to other boards in the same workspace;
  // those boards are covered only by the owner/member clauses below.
  const memberWorkspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).select('_id');

  const memberWorkspaceIds = memberWorkspaces.map((w) => w._id);

  // Home list is membership-based (not board visibility): public boards are not listed here unless the user
  // is a workspace member, owner, or explicit board member.
  let boardQuery = Board.find({
    $or: [
      { workspaceId: { $in: memberWorkspaceIds } },
      { ownerId: userId },
      { 'members.userId': userId },
    ],
  }).sort({ createdAt: -1 });
  if (options?.limit != null) {
    const skip = Math.max(0, options.skip ?? 0);
    boardQuery = boardQuery.skip(skip).limit(options.limit);
  }
  const boards = await boardQuery;
  if (options?.view === 'summary') {
    return boards.map((board) => toBoardSummary(board));
  }
  return boards;
}

export async function getBoardsByWorkspace(
  workspaceId: string,
  userId: string,
  options?: BoardListQueryOptions
): Promise<Array<(Document & IBoard) | BoardSummaryDTO>> {
  await ensureLegacyBoardPositions();

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return [];
  }

  const isWorkspaceMember =
    workspace.ownerId.toString() === userId || workspace.members.some((m) => m.userId.toString() === userId);

  const userHasBoardInWorkspace = !!(await Board.exists({
    workspaceId: workspace._id,
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }));

  if (!isWorkspaceMember && !userHasBoardInWorkspace) {
    return [];
  }

  // Workspace members see all boards in the workspace. Board-only users see only boards they own or are members of.
  let boardQuery = Board.find(
    isWorkspaceMember
      ? { workspaceId }
      : {
          workspaceId,
          $or: [{ ownerId: userId }, { 'members.userId': userId }],
        }
  ).sort({ position: 1, createdAt: -1 });
  if (options?.limit != null) {
    const skip = Math.max(0, options.skip ?? 0);
    boardQuery = boardQuery.skip(skip).limit(options.limit);
  }
  const boards = await boardQuery;
  if (options?.view === 'summary') {
    return boards.map((board) => toBoardSummary(board));
  }
  return boards;
}

/**
 * After a user becomes a workspace member via members UI (not necessarily on each board's
 * `members` list), push board summaries to their `user:*` room so the home page can upsert tiles
 * without refresh. Mirrors {@link getBoardsByWorkspace} visibility.
 */
export async function emitWorkspaceBoardSummariesToUserForHome(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const summaries = (await getBoardsByWorkspace(workspaceId, userId, {
    view: 'summary',
  })) as BoardSummaryDTO[];
  const serverTs = Date.now();
  for (const s of summaries) {
    emitToUser(userId, 'board:updated', {
      boardId: s.id,
      data: s as unknown as Record<string, unknown>,
      serverTs,
    });
  }
}

/**
 * When a user loses workspace membership, drop home tiles for boards they only saw via that
 * membership (not board owner and not an explicit board member).
 */
export async function emitBoardsHiddenOnHomeAfterWorkspaceRemoval(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const boards = await Board.find({ workspaceId })
    .select('_id ownerId members.userId')
    .lean();
  const serverTs = Date.now();
  for (const doc of boards) {
    const bid = doc._id.toString();
    const ownerOk = doc.ownerId != null && doc.ownerId.toString() === userId;
    const memberOk =
      (doc.members as ReadonlyArray<{ userId?: unknown }> | undefined)?.some(
        (m) => m.userId != null && m.userId.toString() === userId,
      ) ?? false;
    if (!ownerOk && !memberOk) {
      emitToUser(userId, 'board:deleted', { boardId: bid, serverTs });
    }
  }
}

export async function getBoardKanbanSnapshotForUser(
  boardId: string,
  userId: string,
  options?: { listLimit?: number }
): Promise<{ board: BoardSummaryDTO; lists: unknown[]; cardsByList: Record<string, unknown[]> } | null> {
  const boardDoc = await Board.findById(boardId);
  if (!boardDoc) {
    return null;
  }
  const canAccess =
    boardDoc.ownerId.toString() === userId ||
    (await isBoardMember(userId, boardId)) ||
    boardDoc.visibility === 'public';
  if (!canAccess) {
    return null;
  }
  const snapshot = await getBoardKanbanSnapshot(boardId, options);
  return {
    board: toBoardSummary(boardDoc),
    lists: snapshot.lists,
    cardsByList: snapshot.cardsByList,
  };
}

export async function updateBoard(
  boardId: string,
  input: UpdateBoardInput,
  userId: string
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  const prevWorkspaceId = board.workspaceId?.toString() ?? null;

  // Check permissions (owner or admin/manager)
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'boards.update');
    if (!allowed) {
      throw new Error('Insufficient permissions to update board');
    }
  }

  // Verify workspace exists if provided; assign position when moving between home buckets
  if (input.workspaceId !== undefined) {
    const prevKey = board.workspaceId?.toString() ?? null;
    const nextKey = input.workspaceId ? String(input.workspaceId) : null;
    const workspaceChanged = prevKey !== nextKey;

    if (workspaceChanged) {
      const isBoardOwner = board.ownerId.toString() === userId;
      const assertMayOrganizeBucket = async (wid: string, direction: 'out' | 'in'): Promise<void> => {
        const ok =
          (await userCanReorganizeWorkspaceHomeBoardBucket(userId, wid)) ||
          (isBoardOwner && (await isWorkspaceMember(userId, wid)));
        if (!ok) {
          throw new Error(
            direction === 'out'
              ? 'Insufficient permissions to move board out of this workspace'
              : 'Insufficient permissions to move board into this workspace',
          );
        }
      };
      if (prevKey != null && prevKey !== '') {
        await assertMayOrganizeBucket(prevKey, 'out');
      }
      if (nextKey != null && nextKey !== '') {
        await assertMayOrganizeBucket(nextKey, 'in');
      }
    }

    if (input.workspaceId) {
      const workspace = await Workspace.findById(input.workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }
      board.workspaceId = new mongoose.Types.ObjectId(input.workspaceId);
    } else {
      delete board.workspaceId;
    }

    if (workspaceChanged) {
      if (input.workspaceId) {
        const wid = new mongoose.Types.ObjectId(input.workspaceId);
        const last = await Board.findOne({
          workspaceId: wid,
          _id: { $ne: board._id },
        })
          .sort({ position: -1 })
          .select('position')
          .lean();
        board.position = (typeof last?.position === 'number' ? last.position : -1) + 1;
      } else {
        const last = await Board.findOne({
          ownerId: board.ownerId,
          _id: { $ne: board._id },
          $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }],
        })
          .sort({ position: -1 })
          .select('position')
          .lean();
        board.position = (typeof last?.position === 'number' ? last.position : -1) + 1;
      }
    }
  }

  if (input.name !== undefined) board.name = input.name;
  if (input.description !== undefined) board.description = input.description;
  if (input.background !== undefined) board.background = input.background;
  if (input.themeSettings !== undefined) {
    board.themeSettings = normalizeBoardThemeSettings(input.themeSettings, board.themeSettings);
    if (input.background === undefined && board.themeSettings != null) {
      const resolvedBackground = resolveBoardBackgroundFromThemeSettings(board.themeSettings);
      if (resolvedBackground !== undefined) {
        board.background = resolvedBackground;
      }
    }
  }
  if (input.visibility !== undefined) board.visibility = input.visibility;
  if (input.settings) {
    if (input.settings.allowComments !== undefined) board.settings.allowComments = input.settings.allowComments;
    if (input.settings.allowAttachments !== undefined) board.settings.allowAttachments = input.settings.allowAttachments;
    if (input.settings.cardCoverImages !== undefined) board.settings.cardCoverImages = input.settings.cardCoverImages;
    if (input.settings.showDueDateAndReminders !== undefined) {
      board.settings.showDueDateAndReminders = input.settings.showDueDateAndReminders;
    }
    if (input.settings.showRemindersOnCards !== undefined) {
      board.settings.showRemindersOnCards = input.settings.showRemindersOnCards;
    }
    if (input.settings.showStartDateOnCards !== undefined) {
      board.settings.showStartDateOnCards = input.settings.showStartDateOnCards;
    }
    if (input.settings.showDueDateOnCards !== undefined) {
      board.settings.showDueDateOnCards = input.settings.showDueDateOnCards;
    }
    if (input.settings.showEndDateOnCards !== undefined) {
      board.settings.showEndDateOnCards = input.settings.showEndDateOnCards;
    }
    if (input.settings.showLabels !== undefined) board.settings.showLabels = input.settings.showLabels;
    if (input.settings.showAssignees !== undefined) board.settings.showAssignees = input.settings.showAssignees;
    if (input.settings.showChecklist !== undefined) board.settings.showChecklist = input.settings.showChecklist;
    if (input.settings.showAttachments !== undefined) {
      board.settings.showAttachments = input.settings.showAttachments;
    }
    if (input.settings.showComments !== undefined) board.settings.showComments = input.settings.showComments;
    if (input.settings.showListCardCount !== undefined) {
      board.settings.showListCardCount = input.settings.showListCardCount;
    }
    if (input.settings.showCardDescriptionPreview !== undefined) {
      board.settings.showCardDescriptionPreview = input.settings.showCardDescriptionPreview;
    }
    if (input.settings.listMaxCards !== undefined) board.settings.listMaxCards = input.settings.listMaxCards;
    if (input.settings.listEnforceMaxCards !== undefined) {
      board.settings.listEnforceMaxCards = input.settings.listEnforceMaxCards;
    }
    if (input.settings.listColumnWidthAuto !== undefined) {
      board.settings.listColumnWidthAuto = input.settings.listColumnWidthAuto;
    }
    if (input.settings.listColumnWidthPx !== undefined) {
      board.settings.listColumnWidthPx = input.settings.listColumnWidthPx;
    }
    if (input.settings.memberActivityLogRetentionDays !== undefined) {
      if (input.settings.memberActivityLogRetentionDays === null) {
        await Board.updateOne(
          { _id: board._id },
          { $unset: { 'settings.memberActivityLogRetentionDays': '' } },
        );
        Reflect.deleteProperty(
          board.settings as unknown as Record<string, unknown>,
          'memberActivityLogRetentionDays',
        );
      } else {
        board.settings.memberActivityLogRetentionDays =
          input.settings.memberActivityLogRetentionDays;
      }
    }
  }

  await board.save();

  const nextWorkspaceId = board.workspaceId?.toString() ?? null;
  const workspaceChanged = prevWorkspaceId !== nextWorkspaceId;

  const affectedUserIds = (() => {
    const ids = [board.ownerId.toString(), ...board.members.map((m) => m.userId.toString())];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const trimmed = id.trim();
      if (trimmed !== '' && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  })();

  // Change Streams will emit the update to the *new* workspaceId (if any). When workspace changes,
  // also notify the *previous* workspace room so home/workspace views update immediately.
  if (workspaceChanged && prevWorkspaceId) {
    const serverTs = Date.now();
    const payload = { boardId, data: board.toObject(), serverTs };
    emitToWorkspace(prevWorkspaceId, 'board:updated', payload);
  }

  if (workspaceChanged && nextWorkspaceId) {
    await Promise.all(
      affectedUserIds.map((uid) => emitWorkspaceHomeSnapshotToUserById(nextWorkspaceId, uid)),
    );
  }
  if (workspaceChanged && prevWorkspaceId) {
    await Promise.all(
      affectedUserIds.map((uid) => emitWorkspaceHomeAccessRefreshForUser(prevWorkspaceId, uid)),
    );
  }

  logAuditEvent({
    userId,
    action: 'board.update',
    resourceType: 'board',
    resourceId: boardId,
    timestamp: new Date(),
  });

  emitBoardUpdatedRealtime(board);

  return board;
}

export async function addBoardMember(
  boardId: string,
  userId: string,
  roleKey: string,
  addedBy: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  // Check permissions (owner or admin/manager)
  if (board.ownerId.toString() !== addedBy) {
    const allowed = await hasPermission({ id: addedBy }, boardId, 'boards.members.add');
    if (!allowed) {
      throw new Error('Insufficient permissions to add members');
    }
    const mode = await resolveBoardRoleUpdateModeForActor(addedBy, boardId);
    if (mode == null) {
      throw new Error('Insufficient permissions to assign member role');
    }
    const actorRoleKey = await resolveBoardActorRoleKey(board, addedBy);
    if (actorRoleKey == null) {
      throw new Error('Insufficient permissions to assign member role');
    }
    const [actorLevel, targetNextLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(roleKey),
    ]);
    if (actorLevel == null || targetNextLevel == null) {
      throw new Error('Invalid role hierarchy configuration');
    }
    const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
      mode,
      actorLevel,
      targetCurrentLevel: targetNextLevel,
      targetNextLevel,
      selfChange: false,
    });
    if (!allowedByMode) {
      throw new Error('Cannot assign role at this hierarchy level');
    }
    if (mode !== 'boards.members.role.update.any' && targetNextLevel > actorLevel) {
      throw new Error('Cannot assign a role with higher hierarchy than your own');
    }
  }

  // Check if user is already a member
  if (board.members.some((m) => m.userId.toString() === userId)) {
    throw new Error('User is already a member');
  }

  board.members.push({
    userId: userId as unknown as typeof board.ownerId,
    roleKey,
    addedAt: new Date(),
  });

  await board.save();

  emitBoardUpdatedRealtime(board);

  const wsId = board.workspaceId?.toString();
  if (wsId) {
    void emitWorkspaceHomeSnapshotToUserById(wsId, userId);
  }

  emitBoardPermissionsUpdated(boardId, [userId], {
    reason: 'board.member.add',
    roleKey,
  });

  logAuditEvent({
    userId: addedBy,
    action: 'board.member.add',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { addedUserId: userId, roleKey },
    timestamp: new Date(),
  });

  const targetDisplayName = await resolveTargetDisplayNameForAudit(userId, auditHints);
  createActivity({
    boardId,
    userId: addedBy,
    type: 'board.member.add',
    description: 'board.member.add',
    metadata: { targetUserId: userId, targetDisplayName, roleKey },
  });

  return board;
}

export async function removeBoardMember(
  boardId: string,
  memberUserId: string,
  userId: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  // Cannot remove owner
  if (board.ownerId.toString() === memberUserId) {
    throw new Error('Cannot remove board owner');
  }

  // Check permissions (owner or admin/manager)
  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'boards.members.remove');
    if (!allowed) {
      throw new Error('Insufficient permissions to remove members');
    }
  }

  const targetDisplayName = await resolveTargetDisplayNameForAudit(memberUserId, auditHints);

  board.members = board.members.filter((m) => m.userId.toString() !== memberUserId);
  await board.save();

  emitBoardUpdatedRealtime(board);
  // Removed user should drop the board immediately on home (no refresh).
  // Do not include them in `emitBoardUpdatedRealtime` — a trailing `board:updated` races with this
  // and can re-upsert the tile for clients still in `workspace:*` or via microtask ordering.
  emitToUser(memberUserId, 'board:deleted', { boardId, serverTs: Date.now() });

  const removedUserWorkspaceId = board.workspaceId?.toString().trim() ?? '';
  if (removedUserWorkspaceId !== '') {
    // If that was their last board here and they are not a workspace member, drop the home row.
    void emitWorkspaceHomeAccessRefreshForUser(removedUserWorkspaceId, memberUserId);
  }

  emitBoardPermissionsUpdated(boardId, [memberUserId], {
    reason: 'board.member.remove',
  });

  logAuditEvent({
    userId,
    action: 'board.member.remove',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { removedUserId: memberUserId },
    timestamp: new Date(),
  });

  createActivity({
    boardId,
    userId,
    type: 'board.member.remove',
    description: 'board.member.remove',
    metadata: { targetUserId: memberUserId, targetDisplayName },
  });

  return board;
}

export async function updateBoardMemberRole(
  boardId: string,
  memberUserId: string,
  newRoleKey: string,
  userId: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  // Cannot change owner role
  if (board.ownerId.toString() === memberUserId) {
    throw new Error('Cannot change board owner role');
  }

  const member = board.members.find((m) => m.userId.toString() === memberUserId);
  if (!member) {
    throw new Error('Member not found');
  }

  const previousRoleKey = member.roleKey;

  // Check permissions + hierarchy restrictions (owner bypass).
  if (board.ownerId.toString() !== userId) {
    const mode = await resolveBoardRoleUpdateModeForActor(userId, boardId);
    if (mode == null) {
      throw new Error('Insufficient permissions to update member roles');
    }
    const actorRoleKey = await resolveBoardActorRoleKey(board, userId);
    if (actorRoleKey == null) {
      throw new Error('Insufficient permissions to update member roles');
    }
    const [actorLevel, targetCurrentLevel, targetNextLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(previousRoleKey),
      getRoleHierarchyLevel(newRoleKey),
    ]);
    if (actorLevel == null || targetCurrentLevel == null || targetNextLevel == null) {
      throw new Error('Invalid role hierarchy configuration');
    }
    const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
      mode,
      actorLevel,
      targetCurrentLevel,
      targetNextLevel,
      selfChange: memberUserId === userId,
    });
    if (!allowedByMode) {
      throw new Error('Role update exceeds your hierarchy permissions');
    }
    if (mode !== 'boards.members.role.update.any' && targetNextLevel > actorLevel) {
      throw new Error('Cannot assign a role with higher hierarchy than your own');
    }
  }

  const targetDisplayName = await resolveTargetDisplayNameForAudit(memberUserId, auditHints);
  member.roleKey = newRoleKey;
  await board.save();

  emitBoardUpdatedRealtime(board);

  emitBoardPermissionsUpdated(boardId, [memberUserId], {
    reason: 'board.member.role.update',
    roleKey: newRoleKey,
  });

  logAuditEvent({
    userId,
    action: 'board.member.role.update',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { memberUserId, previousRoleKey, newRoleKey },
    timestamp: new Date(),
  });

  createActivity({
    boardId,
    userId,
    type: 'board.member.role.update',
    description: 'board.member.role.update',
    metadata: {
      targetUserId: memberUserId,
      targetDisplayName,
      previousRoleKey,
      newRoleKey,
    },
  });

  return board;
}

export async function deleteBoard(boardId: string, userId: string): Promise<boolean> {
  const board = await Board.findById(boardId);
  if (!board) {
    return false;
  }

  // Only owner can delete
  if (board.ownerId.toString() !== userId) {
    throw new Error('Only board owner can delete board');
  }

  await deleteAllMongoAndStorageForBoardIds([board._id]);

  const workspaceId = board.workspaceId?.toString();
  const ownerId = board.ownerId.toString();
  const memberUserIds = board.members.map((m) => m.userId.toString());

  await Board.findByIdAndDelete(boardId);

  const serverTs = Date.now();
  emitToBoard(boardId, 'board:deleted', { boardId, serverTs });
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'board:deleted', { boardId, serverTs });
  }
  emitToUser(ownerId, 'board:deleted', { boardId, serverTs });
  for (const memberUserId of memberUserIds) {
    if (memberUserId !== ownerId) {
      emitToUser(memberUserId, 'board:deleted', { boardId, serverTs });
    }
  }

  if (workspaceId) {
    const homeAccessUserIds = new Set<string>([ownerId, ...memberUserIds]);
    for (const uid of homeAccessUserIds) {
      void emitWorkspaceHomeAccessRefreshForUser(workspaceId, uid);
    }
  }

  logAuditEvent({
    userId,
    action: 'board.delete',
    resourceType: 'board',
    resourceId: boardId,
    timestamp: new Date(),
  });

  return true;
}

