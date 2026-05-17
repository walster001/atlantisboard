/** Per-user account capabilities (not workspace/board role permissions). */
export const ACCOUNT_CAPABILITY_KEYS = ['import.display', 'workspaces.create'] as const;

export type AccountCapabilityKey = (typeof ACCOUNT_CAPABILITY_KEYS)[number];

export const ACCOUNT_CAPABILITY_IMPORT_DISPLAY: AccountCapabilityKey = 'import.display';
export const ACCOUNT_CAPABILITY_WORKSPACES_CREATE: AccountCapabilityKey = 'workspaces.create';

export function isAccountCapabilityKey(value: string): value is AccountCapabilityKey {
  return (ACCOUNT_CAPABILITY_KEYS as readonly string[]).includes(value);
}

export function accountCapabilitiesFromFlags(flags: {
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}): AccountCapabilityKey[] {
  const caps: AccountCapabilityKey[] = [];
  if (flags.canImportBoards) {
    caps.push(ACCOUNT_CAPABILITY_IMPORT_DISPLAY);
  }
  if (flags.canCreateWorkspace) {
    caps.push(ACCOUNT_CAPABILITY_WORKSPACES_CREATE);
  }
  return caps;
}

export function flagsFromAccountCapabilities(
  capabilities: readonly string[] | undefined,
): { readonly canImportBoards: boolean; readonly canCreateWorkspace: boolean } {
  const set = new Set(capabilities ?? []);
  return {
    canImportBoards: set.has(ACCOUNT_CAPABILITY_IMPORT_DISPLAY),
    canCreateWorkspace: set.has(ACCOUNT_CAPABILITY_WORKSPACES_CREATE),
  };
}
