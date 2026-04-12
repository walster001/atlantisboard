/**
 * Canonical max lengths for board / list / card text fields (Mongoose, REST zod, client UX).
 * Sized for Trello JSON import parity (Trello allows long board descriptions and card titles).
 */

export const BOARD_NAME_MAX_LENGTH = 512;

export const BOARD_DESCRIPTION_MAX_LENGTH = 16384;

export const LIST_NAME_MAX_LENGTH = 512;

/** Trello card title limit is 16384; align so imports never truncate titles. */
export const CARD_TITLE_MAX_LENGTH = 16384;

/** Stored on card attachment subdocs (import source name for mapping after upload). */
export const CARD_ATTACHMENT_ORIGINAL_NAME_MAX_LENGTH = 512;
