/** Typed phrase required in request bodies for high-impact admin operations. */
export const ADMIN_DESTRUCTIVE_CONFIRM_PHRASE = 'DELETE' as const;

export type AdminDestructiveConfirmPhrase = typeof ADMIN_DESTRUCTIVE_CONFIRM_PHRASE;
