import { hasPermission } from '../../utils/permissions.js';
import type { BoardMemberRoleUpdateModeKey } from '../../services/roleService.js';

export async function resolveBoardRoleUpdateModeForActor(
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
    return 'boards.members.role.update.samelower';
  }
  return null;
}

export function selectFields(items: unknown[], fieldsCsv: string | undefined): unknown[] {
  if (fieldsCsv === undefined || fieldsCsv.trim() === '') {
    return items;
  }
  const fields = fieldsCsv
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '');
  if (fields.length === 0) {
    return items;
  }
  return items.map((item) => {
    if (item == null || typeof item !== 'object') {
      return item;
    }
    const obj = item as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in obj) {
        selected[field] = obj[field];
      }
    }
    if ('id' in obj) {
      selected.id = obj.id;
    }
    return selected;
  });
}
