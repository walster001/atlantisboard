import {
  BOARD_EXPORT_FORMATS,
  type BoardExportFormat,
} from './boardExportFormats.js';

export const BOARD_EXPORT_PERMISSION_KEYS = {
  csv: 'export.board.csv',
  trello: 'export.board.trello',
  wekan: 'export.board.wekan',
  atlantisboard: 'export.board.atlantisboard',
} as const satisfies Record<BoardExportFormat, string>;

export type BoardExportPermissionKey =
  (typeof BOARD_EXPORT_PERMISSION_KEYS)[BoardExportFormat];

export const BOARD_JSON_EXPORT_PERMISSION_KEYS: readonly BoardExportPermissionKey[] = [
  BOARD_EXPORT_PERMISSION_KEYS.trello,
  BOARD_EXPORT_PERMISSION_KEYS.wekan,
  BOARD_EXPORT_PERMISSION_KEYS.atlantisboard,
];

/** Migrated from this legacy key on role startup; still honored at runtime until removed from custom roles. */
export const LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY = 'export.board.json' as const;

export function boardExportPermissionKey(format: BoardExportFormat): BoardExportPermissionKey {
  return BOARD_EXPORT_PERMISSION_KEYS[format];
}

export function isBoardExportPermissionKey(key: string): key is BoardExportPermissionKey {
  return (Object.values(BOARD_EXPORT_PERMISSION_KEYS) as readonly string[]).includes(key);
}

export function hasBoardExportFormatPermission(
  allowedKeys: ReadonlySet<string> | readonly string[],
  format: BoardExportFormat,
): boolean {
  const set = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys);
  if (set.has(boardExportPermissionKey(format))) {
    return true;
  }
  if (format !== 'csv' && set.has(LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY)) {
    return true;
  }
  return false;
}

export function canExportBoardInAnyFormat(
  allowedKeys: ReadonlySet<string> | readonly string[],
): boolean {
  return BOARD_EXPORT_FORMATS.some((format) => hasBoardExportFormatPermission(allowedKeys, format));
}
