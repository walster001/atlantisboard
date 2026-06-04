export const BUILTIN_ROLE_ORDER = ['admin', 'manager', 'viewer'] as const;

export const BUILTIN_ROLE_DESCRIPTIONS: Readonly<Record<(typeof BUILTIN_ROLE_ORDER)[number], string>> = {
  admin:
    'Full workspace and board administration. Can manage settings, members, invites, structure, and all card content, including high-impact actions.',
  manager:
    'Day-to-day board operations role. Can organize lists/cards and manage board membership with constrained hierarchy updates, without full admin governance.',
  viewer:
    'Read-only collaboration role. Can access workspace and board content, labels, attachments, and exports, but cannot perform member or content mutations.',
} as const;
