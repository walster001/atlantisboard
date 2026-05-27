/// <reference types="bun-types" />
import { describe, expect, it, beforeEach } from 'bun:test';
import type { Server as SocketIOServer } from 'socket.io';
import {
  emitToBoard,
  emitToUsers,
  getSocketTelemetrySnapshot,
  resetSocketIOForTests,
  setSocketIOInstance,
} from '../src/server/utils/socketIO.js';

type RoomEmit = { room: string; event: string; payload: unknown };
type GlobalEmit = { event: string; payload: unknown };

function createMockIo(logs: { roomEmits: RoomEmit[]; globalEmits: GlobalEmit[] }): SocketIOServer {
  return {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          logs.roomEmits.push({ room, event, payload });
        },
      };
    },
    emit(event: string, payload: unknown) {
      logs.globalEmits.push({ event, payload });
    },
  } as unknown as SocketIOServer;
}

describe('socket realtime helpers', () => {
  beforeEach(() => {
    resetSocketIOForTests();
  });

  it('dedupes identical room emits in a short TTL window', () => {
    const logs = { roomEmits: [] as RoomEmit[], globalEmits: [] as GlobalEmit[] };
    setSocketIOInstance(createMockIo(logs));
    const payload = { boardId: 'b1', cardId: 'c1' };
    emitToBoard('b1', 'card:updated', payload);
    emitToBoard('b1', 'card:updated', payload);
    expect(logs.roomEmits.length).toBe(1);
    expect(logs.roomEmits[0]?.room).toBe('board:b1');
  });

  it('batches configured events into one envelope', async () => {
    const logs = { roomEmits: [] as RoomEmit[], globalEmits: [] as GlobalEmit[] };
    setSocketIOInstance(createMockIo(logs));
    emitToBoard('b1', 'import:progress', { progress: 10 });
    emitToBoard('b1', 'import:progress', { progress: 20 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(logs.roomEmits.length).toBe(1);
    expect(logs.roomEmits[0]?.event).toBe('import:progress');
    const payload = logs.roomEmits[0]?.payload as { batchSize?: number; events?: unknown[] };
    expect(payload.batchSize).toBe(2);
    expect(Array.isArray(payload.events)).toBe(true);
  });

  it('targets unique user rooms once per event', () => {
    const logs = { roomEmits: [] as RoomEmit[], globalEmits: [] as GlobalEmit[] };
    setSocketIOInstance(createMockIo(logs));
    emitToUsers(['u1', 'u1', 'u2'], 'permissions.updated', { reason: 'test' });
    expect(logs.roomEmits.map((entry) => entry.room).sort()).toEqual(['user:u1', 'user:u2']);
    const telemetry = getSocketTelemetrySnapshot().filter((entry) => entry.event === 'permissions.updated');
    expect(telemetry.length).toBe(2);
  });
});
