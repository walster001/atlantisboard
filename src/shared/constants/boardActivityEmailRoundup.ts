/** Handlebars template filename (without extension) for weekly board activity roundup emails. */
export const BOARD_ACTIVITY_ROUNDUP_EMAIL_TEMPLATE = 'board-activity-roundup' as const;

/** Wide layout used so activity logs use the full email container width. */
export const BOARD_ACTIVITY_ROUNDUP_EMAIL_LAYOUT = 'roundup-wide' as const;

/** Outer email card width (px) for roundup messages. */
export const BOARD_ACTIVITY_ROUNDUP_EMAIL_MAX_WIDTH_PX = 920;

/** Rolling window length for each weekly roundup. */
export const BOARD_ACTIVITY_ROUNDUP_PERIOD_DAYS = 7;

/** Maximum configured recipients per board. */
export const BOARD_ACTIVITY_ROUNDUP_MAX_RECIPIENTS = 50;

/** Max height (px) of the scrollable activity log region in roundup emails. */
export const BOARD_ACTIVITY_ROUNDUP_LOG_SCROLL_MAX_HEIGHT_PX = 420;
