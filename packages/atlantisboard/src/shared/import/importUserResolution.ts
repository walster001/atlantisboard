import type { UnmappedUserPolicy } from './importPreflight.js';

export type ImportUserResolution =
  | { kind: 'map'; userId: string }
  | { kind: 'discard' }
  | { kind: 'create_placeholder' };

interface ResolveImportUserArgs {
  readonly decision?: {
    readonly sourceUserId: string;
    readonly mappedUserId?: string | undefined;
    readonly discard?: boolean | undefined;
  };
  readonly autoMatchedUserId?: string;
  readonly policy: UnmappedUserPolicy;
  readonly importerUserId: string;
}

export function resolveImportUserResolution({
  decision,
  autoMatchedUserId,
  policy,
  importerUserId,
}: ResolveImportUserArgs): ImportUserResolution {
  if (decision?.mappedUserId != null && decision.mappedUserId.trim() !== '') {
    return { kind: 'map', userId: decision.mappedUserId };
  }
  if (decision?.discard === true) {
    return { kind: 'discard' };
  }
  if (autoMatchedUserId != null && autoMatchedUserId.trim() !== '') {
    return { kind: 'map', userId: autoMatchedUserId };
  }
  if (policy === 'discard_unmapped') {
    return { kind: 'discard' };
  }
  if (policy === 'create_placeholders') {
    return { kind: 'create_placeholder' };
  }
  return { kind: 'map', userId: importerUserId };
}
