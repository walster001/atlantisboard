export interface AdminBackupLocationStatus {
  readonly configured: boolean;
  readonly path: string | null;
  readonly exists: boolean;
  readonly isDirectory: boolean;
  readonly writable: boolean;
  readonly persistedToEnvFile: boolean;
  readonly dockerFullstack: boolean;
  readonly suggestedPath: string | null;
}

export interface AdminBackupLocationCheckResult {
  readonly path: string;
  readonly exists: boolean;
  readonly isDirectory: boolean;
  readonly writable: boolean;
}
