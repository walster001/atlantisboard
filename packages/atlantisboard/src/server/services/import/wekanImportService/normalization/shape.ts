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

export function stripToWekanBoard(obj: Record<string, unknown>): Record<string, unknown> {
  const board: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!WEKAN_SINGLE_BOARD_NESTED_KEYS.has(key)) {
      board[key] = value;
    }
  }
  return board;
}
