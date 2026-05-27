import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;
type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

type RealtimeFlags = {
  dedupeEnabled: boolean;
  metricsEnabled: boolean;
  batchingEnabled: boolean;
  singleSourceMode: boolean;
  deltaMode: boolean;
};

type EmitTarget = 'board' | 'workspace' | 'user' | 'global' | 'custom';

type TelemetryEntry = {
  readonly target: EmitTarget;
  readonly event: string;
  readonly roomCount: number;
  readonly payloadBytes: number;
  readonly timestamp: number;
};

type BatchState = {
  event: string;
  targets: string[];
  payloads: unknown[];
  timer: ReturnType<typeof setTimeout>;
};

const telemetryBuffer: TelemetryEntry[] = [];
const telemetryLimit = 1000;
const dedupeCache = new Map<string, number>();
const batchStates = new Map<string, BatchState>();
const DEFAULT_BATCH_WINDOW_MS = 80;
/** Lower bound so batching still flushes; upper bound caps env-driven delay (avoids unbounded setTimeout). */
const MIN_REALTIME_BATCH_WINDOW_MS = 10;
const MAX_REALTIME_BATCH_WINDOW_MS = 60_000;
const dedupeTtlMs = 1500;

function readEnvBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return fallback;
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

const realtimeFlags: RealtimeFlags = {
  dedupeEnabled: readEnvBoolean('REALTIME_DEDUP_ENABLED', true),
  metricsEnabled: readEnvBoolean('REALTIME_METRICS_ENABLED', true),
  batchingEnabled: readEnvBoolean('REALTIME_SERVER_BATCHING_ENABLED', true),
  singleSourceMode: readEnvBoolean('REALTIME_SINGLE_SOURCE_MODE', false),
  deltaMode: readEnvBoolean('REALTIME_DELTA_MODE', true),
};

const batchWindowMs = Math.min(
  MAX_REALTIME_BATCH_WINDOW_MS,
  Math.max(
    MIN_REALTIME_BATCH_WINDOW_MS,
    readEnvNumber('REALTIME_BATCH_WINDOW_MS', DEFAULT_BATCH_WINDOW_MS),
  ),
);
const batchableEvents = new Set(
  (process.env.REALTIME_BATCHABLE_EVENTS ?? 'import:progress,cards:positions-batch-updated,lists:positions-batch-updated')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== ''),
);

/**
 * Set the Socket.io server instance
 * Called from src/server/sockets/index.ts after initialization
 */
export function setSocketIOInstance(io: SocketIOServer): void {
  ioInstance = io;
}

/**
 * Get the Socket.io server instance
 * Use this in routes/services to emit events
 */
export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

function normalizePayloadForKey(payload: unknown): string {
  if (payload == null) {
    return 'null';
  }
  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload);
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable]';
  }
}

function payloadBytes(payload: unknown): number {
  try {
    const normalized: JsonLike = (payload ?? null) as JsonLike;
    return Buffer.byteLength(JSON.stringify(normalized), 'utf8');
  } catch {
    return 0;
  }
}

function pushTelemetry(target: EmitTarget, event: string, roomCount: number, payload: unknown): void {
  if (!realtimeFlags.metricsEnabled) {
    return;
  }
  telemetryBuffer.push({
    target,
    event,
    roomCount,
    payloadBytes: payloadBytes(payload),
    timestamp: Date.now(),
  });
  if (telemetryBuffer.length > telemetryLimit) {
    telemetryBuffer.splice(0, telemetryBuffer.length - telemetryLimit);
  }
}

function shouldSkipDedupe(event: string): boolean {
  return event === 'user:typing' || event === 'user:joined' || event === 'user:left';
}

function shouldDedupeEmit(target: EmitTarget, room: string, event: string, payload: unknown): boolean {
  if (!realtimeFlags.dedupeEnabled || shouldSkipDedupe(event)) {
    return false;
  }
  const now = Date.now();
  for (const [key, expiresAt] of dedupeCache) {
    if (expiresAt <= now) {
      dedupeCache.delete(key);
    }
  }
  const key = `${target}|${room}|${event}|${normalizePayloadForKey(payload)}`;
  const expiresAt = dedupeCache.get(key);
  if (expiresAt != null && expiresAt > now) {
    return true;
  }
  dedupeCache.set(key, now + dedupeTtlMs);
  return false;
}

function emitToRoom(room: string, target: EmitTarget, event: string, data: unknown): void {
  if (ioInstance == null) {
    return;
  }
  if (shouldDedupeEmit(target, room, event, data)) {
    return;
  }
  ioInstance.to(room).emit(event, data);
  pushTelemetry(target, event, 1, data);
}

function flushBatch(key: string): void {
  const state = batchStates.get(key);
  if (!state || ioInstance == null) {
    return;
  }
  batchStates.delete(key);
  const latestPayload = state.payloads[state.payloads.length - 1];
  const batchPayload = {
    batchSize: state.payloads.length,
    events: state.payloads,
    latest: latestPayload,
    serverTs: Date.now(),
  };
  for (const targetRoom of state.targets) {
    emitToRoom(targetRoom, 'custom', state.event, batchPayload);
  }
}

function emitToRooms(rooms: string[], target: EmitTarget, event: string, data: unknown): void {
  if (ioInstance == null || rooms.length === 0) {
    return;
  }
  const uniqueRooms = [...new Set(rooms.map((room) => room.trim()).filter((room) => room !== ''))];
  if (uniqueRooms.length === 0) {
    return;
  }
  if (realtimeFlags.batchingEnabled && batchableEvents.has(event)) {
    const key = `${event}|${uniqueRooms.join(',')}`;
    const existing = batchStates.get(key);
    if (existing != null) {
      existing.payloads.push(data);
      return;
    }
    const timer = setTimeout(() => {
      flushBatch(key);
    }, batchWindowMs);
    batchStates.set(key, {
      event,
      targets: uniqueRooms,
      payloads: [data],
      timer,
    });
    return;
  }
  for (const room of uniqueRooms) {
    emitToRoom(room, target, event, data);
  }
}

export function getRealtimeFlags(): Readonly<RealtimeFlags> {
  return realtimeFlags;
}

export function shouldEmitFromServicePath(): boolean {
  return realtimeFlags.singleSourceMode;
}

export function getSocketTelemetrySnapshot(): ReadonlyArray<TelemetryEntry> {
  return [...telemetryBuffer];
}

export function resetRealtimeTelemetryForTests(): void {
  telemetryBuffer.length = 0;
  dedupeCache.clear();
  for (const state of batchStates.values()) {
    clearTimeout(state.timer);
  }
  batchStates.clear();
}

/** Clears the Socket.io instance and pending batch timers (test isolation). */
export function resetSocketIOForTests(): void {
  resetRealtimeTelemetryForTests();
  ioInstance = null;
}

/**
 * Emit event to a board room
 */
export function emitToBoard(boardId: string, event: string, data: unknown): void {
  emitToRooms([`board:${boardId}`], 'board', event, data);
}

/**
 * Emit event to a workspace room
 */
export function emitToWorkspace(workspaceId: string, event: string, data: unknown): void {
  emitToRooms([`workspace:${workspaceId}`], 'workspace', event, data);
}

/**
 * Emit event to a user room (for notifications)
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  emitToUsers([userId], event, data);
}

export function emitToUsers(userIds: readonly string[], event: string, data: unknown): void {
  const rooms = userIds
    .map((userId) => userId.trim())
    .filter((userId) => userId !== '')
    .map((userId) => `user:${userId}`);
  emitToRooms(rooms, 'user', event, data);
}

export function emitToAudience(
  audience: { boardId?: string; workspaceId?: string; userIds?: readonly string[] },
  event: string,
  data: unknown,
): void {
  const rooms: string[] = [];
  if (audience.boardId != null && audience.boardId.trim() !== '') {
    rooms.push(`board:${audience.boardId.trim()}`);
  }
  if (audience.workspaceId != null && audience.workspaceId.trim() !== '') {
    rooms.push(`workspace:${audience.workspaceId.trim()}`);
  }
  if (audience.userIds != null) {
    for (const userId of audience.userIds) {
      const uid = userId.trim();
      if (uid !== '') {
        rooms.push(`user:${uid}`);
      }
    }
  }
  emitToRooms(rooms, 'custom', event, data);
}

/**
 * Emit event to all connected clients
 */
export function emitToAll(event: string, data: unknown): void {
  if (ioInstance) {
    if (shouldDedupeEmit('global', '*', event, data)) {
      return;
    }
    ioInstance.emit(event, data);
    pushTelemetry('global', event, 1, data);
  }
}

