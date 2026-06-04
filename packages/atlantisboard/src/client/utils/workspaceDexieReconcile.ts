import { db, type WorkspaceDB } from '../store/database.js';

/**
 * Make Dexie `workspaces` match GET /workspaces (summary): upsert visible rows and delete stale ids.
 * Without deletes, removed or board-only-only workspaces leave orphan rows that still trigger
 * `workspace:join` while the server denies membership.
 */
export async function replaceDexieWorkspacesFromHomeApiList(
  workspaces: readonly WorkspaceDB[],
): Promise<void> {
  const visible = new Set(
    workspaces
      .map((w) => String(w.id).trim())
      .filter((id) => id !== ''),
  );
  const keys = await db.workspaces.toCollection().primaryKeys();
  const stale = keys.filter((k) => !visible.has(String(k)));
  if (stale.length > 0) {
    await db.workspaces.bulkDelete(stale);
  }
  if (workspaces.length > 0) {
    await db.workspaces.bulkPut([...workspaces]);
  }
}
