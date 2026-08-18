import { z } from 'zod';
import {
  MINIO_BUCKET_NAMES,
  type MinioBucketName,
} from './minioBuckets.js';

/** What a manual or scheduled backup includes beyond the MongoDB dump. */
export type AdminBackupScope = 'database' | 'database_and_attachments';

export const ADMIN_BACKUP_SCOPE_VALUES = [
  'database',
  'database_and_attachments',
] as const satisfies readonly AdminBackupScope[];

export const DEFAULT_ADMIN_BACKUP_SCOPE: AdminBackupScope = 'database_and_attachments';

export const DEFAULT_ADMIN_BACKUP_MINIO_PREFIXES: readonly MinioBucketName[] = MINIO_BUCKET_NAMES;

export const BACKUP_SCOPE_SEGMENT_OPTIONS: ReadonlyArray<{
  readonly value: AdminBackupScope;
  readonly label: string;
}> = [
  { value: 'database', label: 'Database only' },
  { value: 'database_and_attachments', label: 'Database + attachments' },
];

export const BACKUP_MINIO_PREFIX_OPTIONS: ReadonlyArray<{
  readonly value: MinioBucketName;
  readonly label: string;
  readonly description: string;
}> = [
  {
    value: 'card-attachments',
    label: 'Card attachments',
    description: 'Files attached to cards.',
  },
  {
    value: 'branding',
    label: 'App branding',
    description: 'Login and app branding assets.',
  },
  {
    value: 'user-avatars',
    label: 'User avatars',
    description: 'Profile pictures.',
  },
  {
    value: 'fonts',
    label: 'Custom fonts',
    description: 'Uploaded UI fonts.',
  },
  {
    value: 'import-inline',
    label: 'Import inline images',
    description: 'Trello/Wekan import staging objects.',
  },
  {
    value: 'backgrounds',
    label: 'Board backgrounds',
    description: 'Board theme background images.',
  },
];

const minioBucketNameSchema = z.enum(MINIO_BUCKET_NAMES);

export const adminBackupScopeRequestSchema = z
  .object({
    scope: z.enum(ADMIN_BACKUP_SCOPE_VALUES),
    minioPrefixes: z.array(minioBucketNameSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'database_and_attachments') {
      const prefixes = value.minioPrefixes ?? [];
      if (prefixes.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Select at least one MinIO storage folder.',
          path: ['minioPrefixes'],
        });
      }
    }
  });

export type AdminBackupScopeRequest = z.infer<typeof adminBackupScopeRequestSchema>;

export function isAdminBackupScope(value: string): value is AdminBackupScope {
  return (ADMIN_BACKUP_SCOPE_VALUES as readonly string[]).includes(value);
}

export function normalizeAdminBackupMinioPrefixes(
  prefixes: readonly string[] | undefined,
): readonly MinioBucketName[] {
  if (prefixes == null || prefixes.length === 0) {
    return DEFAULT_ADMIN_BACKUP_MINIO_PREFIXES;
  }
  const allowed = new Set<string>(MINIO_BUCKET_NAMES);
  const normalized: MinioBucketName[] = [];
  for (const prefix of prefixes) {
    if (allowed.has(prefix)) {
      normalized.push(prefix as MinioBucketName);
    }
  }
  return normalized.length > 0 ? normalized : DEFAULT_ADMIN_BACKUP_MINIO_PREFIXES;
}

export function buildAdminBackupScopeRequest(
  scope: AdminBackupScope,
  minioPrefixes: readonly MinioBucketName[],
): AdminBackupScopeRequest {
  if (scope === 'database') {
    return { scope: 'database' };
  }
  return {
    scope: 'database_and_attachments',
    minioPrefixes: [...minioPrefixes],
  };
}

export function parseAdminBackupScopeRequest(input: {
  readonly scope: AdminBackupScope;
  readonly minioPrefixes: readonly MinioBucketName[];
}): AdminBackupScopeRequest {
  return adminBackupScopeRequestSchema.parse(buildAdminBackupScopeRequest(input.scope, input.minioPrefixes));
}
