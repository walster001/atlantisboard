import { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { builtinRoleSelectOptions, type RoleKey } from '../../../shared/permissions/catalog.js';

export type ImportRoleSelectOption = { readonly value: RoleKey; readonly label: string };

const BUILTIN_FALLBACK_OPTIONS: ImportRoleSelectOption[] = builtinRoleSelectOptions().map((option) => ({
  value: option.value,
  label: option.label,
}));

function mapAssignableRoles(
  roles: ReadonlyArray<{ key: string; displayName: string }>,
): ImportRoleSelectOption[] {
  return roles.map((role) => ({
    value: role.key as RoleKey,
    label: role.displayName,
  }));
}

function mapAdminRoleRows(roles: unknown[]): ImportRoleSelectOption[] {
  return roles
    .map((raw) => {
      const row = raw as { key?: unknown; displayName?: unknown };
      if (typeof row.key !== 'string' || row.key.trim() === '') {
        return null;
      }
      const label =
        typeof row.displayName === 'string' && row.displayName.trim() !== ''
          ? row.displayName
          : row.key;
      return { value: row.key as RoleKey, label } satisfies ImportRoleSelectOption;
    })
    .filter((option): option is ImportRoleSelectOption => option != null);
}

async function loadRolesFromOwnedWorkspaces(userId: string): Promise<ImportRoleSelectOption[]> {
  const response = await api.getWorkspaces({ view: 'summary', fields: ['id', 'ownerId'] });
  const workspaces = Array.isArray(response.workspaces) ? response.workspaces : [];
  let best: ImportRoleSelectOption[] = [];

  for (const raw of workspaces) {
    const workspace = raw as { id?: unknown; ownerId?: unknown };
    const workspaceId = typeof workspace.id === 'string' ? workspace.id : '';
    const ownerId =
      typeof workspace.ownerId === 'string'
        ? workspace.ownerId
        : workspace.ownerId != null
          ? String(workspace.ownerId)
          : '';
    if (workspaceId === '' || ownerId !== userId) {
      continue;
    }
    try {
      const roleResponse = await api.getWorkspaceAssignableRoles(workspaceId);
      const roles = Array.isArray(roleResponse.roles) ? roleResponse.roles : [];
      const mapped = mapAssignableRoles(roles);
      if (mapped.length > best.length) {
        best = mapped;
      }
    } catch {
      // Try the next owned workspace.
    }
  }

  return best;
}

async function loadRolesFromAnyWorkspace(): Promise<ImportRoleSelectOption[]> {
  const response = await api.getWorkspaces({ view: 'summary', fields: ['id'] });
  const workspaces = Array.isArray(response.workspaces) ? response.workspaces : [];
  let best: ImportRoleSelectOption[] = [];

  for (const raw of workspaces) {
    const workspace = raw as { id?: unknown };
    const workspaceId = typeof workspace.id === 'string' ? workspace.id : '';
    if (workspaceId === '') {
      continue;
    }
    try {
      const roleResponse = await api.getWorkspaceAssignableRoles(workspaceId);
      const roles = Array.isArray(roleResponse.roles) ? roleResponse.roles : [];
      const mapped = mapAssignableRoles(roles);
      if (mapped.length > best.length) {
        best = mapped;
      }
    } catch {
      // Try the next workspace.
    }
  }

  return best;
}

async function resolveImportAssignableRoleOptions(params: {
  readonly boardId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly isAppAdmin?: boolean | undefined;
  readonly userId?: string | undefined;
}): Promise<ImportRoleSelectOption[]> {
  if (params.boardId != null && params.boardId.trim() !== '') {
    const response = await api.getBoardAssignableRoles(params.boardId);
    const roles = Array.isArray(response.roles) ? response.roles : [];
    const mapped = mapAssignableRoles(roles);
    return mapped.length > 0 ? mapped : BUILTIN_FALLBACK_OPTIONS;
  }

  if (params.workspaceId != null && params.workspaceId.trim() !== '') {
    const response = await api.getWorkspaceAssignableRoles(params.workspaceId);
    const roles = Array.isArray(response.roles) ? response.roles : [];
    const mapped = mapAssignableRoles(roles);
    return mapped.length > 0 ? mapped : BUILTIN_FALLBACK_OPTIONS;
  }

  if (params.isAppAdmin === true) {
    const response = await api.getRoles();
    const roles = Array.isArray(response.roles) ? response.roles : [];
    const mapped = mapAdminRoleRows(roles);
    return mapped.length > 0 ? mapped : BUILTIN_FALLBACK_OPTIONS;
  }

  if (params.userId != null && params.userId.trim() !== '') {
    const ownedWorkspaceRoles = await loadRolesFromOwnedWorkspaces(params.userId);
    if (ownedWorkspaceRoles.length > 0) {
      return ownedWorkspaceRoles;
    }
  }

  const anyWorkspaceRoles = await loadRolesFromAnyWorkspace();
  return anyWorkspaceRoles.length > 0 ? anyWorkspaceRoles : BUILTIN_FALLBACK_OPTIONS;
}

export interface UseImportAssignableRoleOptionsParams {
  readonly boardId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly isAppAdmin?: boolean | undefined;
  readonly userId?: string | undefined;
}

export function useImportAssignableRoleOptions(
  params: UseImportAssignableRoleOptionsParams,
): ReadonlyArray<ImportRoleSelectOption> {
  const [roleOptions, setRoleOptions] = useState<ImportRoleSelectOption[]>(BUILTIN_FALLBACK_OPTIONS);
  const { boardId, workspaceId, isAppAdmin, userId } = params;

  useEffect(() => {
    let cancelled = false;
    void resolveImportAssignableRoleOptions({ boardId, workspaceId, isAppAdmin, userId })
      .then((options) => {
        if (!cancelled) {
          setRoleOptions(options);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoleOptions(BUILTIN_FALLBACK_OPTIONS);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, workspaceId, isAppAdmin, userId]);

  return roleOptions;
}
