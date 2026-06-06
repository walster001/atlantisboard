import { api } from './api.js';

const FETCH_CHUNK = 12;

export async function fetchBoardPermissionsChunked(
  boardIds: readonly string[],
): Promise<Map<string, ReadonlySet<string>>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (let i = 0; i < boardIds.length; i += FETCH_CHUNK) {
    const slice = boardIds.slice(i, i + FETCH_CHUNK);
    const rows = await Promise.all(
      slice.map(async (id) => {
        try {
          const r = await api.getMyBoardPermissions(id);
          return { id, perms: new Set(r.permissions ?? []) };
        } catch {
          return { id, perms: new Set<string>() };
        }
      }),
    );
    for (const { id, perms } of rows) {
      out.set(id, perms);
    }
  }
  return out;
}
