export const BOARD_EXPORT_FORMATS = ['csv', 'trello', 'wekan', 'atlantisboard'] as const;

export type BoardExportFormat = (typeof BOARD_EXPORT_FORMATS)[number];

export function isBoardExportFormat(value: string): value is BoardExportFormat {
  return (BOARD_EXPORT_FORMATS as readonly string[]).includes(value);
}

export const BOARD_EXPORT_FORMAT_LABELS: Record<BoardExportFormat, string> = {
  csv: 'CSV',
  trello: 'Trello JSON',
  wekan: 'Wekan JSON',
  atlantisboard: 'Atlantisboard JSON',
};

export const BOARD_EXPORT_FORMAT_EXTENSIONS: Record<BoardExportFormat, string> = {
  csv: 'csv',
  trello: 'json',
  wekan: 'json',
  atlantisboard: 'json',
};

export const ATLANTISBOARD_EXPORT_FORMAT_VERSION = 'atlantisboard-board-v1' as const;

/** Max attachment bytes inlined as a data URL in portable exports. */
export const BOARD_EXPORT_INLINE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
