import { forwardRef, memo, useCallback, useEffect, useMemo, useState, type ComponentPropsWithoutRef } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import {
  type ImportPreflightUser,
  type ImportUserDecision,
  type UnmappedUserPolicy,
} from '../../../shared/import/importPreflight.js';
import { api } from '../../utils/api.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';

interface ExistingUserOption {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
}
interface ExistingUserSelectOption {
  readonly value: string;
  readonly label: string;
}

interface ImportUserManagementTabProps {
  readonly users: readonly ImportPreflightUser[];
  readonly decisions: readonly ImportUserDecision[];
  readonly policy: UnmappedUserPolicy;
  readonly onChangeDecisions: (next: readonly ImportUserDecision[]) => void;
  readonly onChangePolicy: (next: UnmappedUserPolicy) => void;
  readonly onFinalMappingChange?: (next: readonly ImportUserDecision[]) => void;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function renderIdentity(u: ImportPreflightUser): string {
  const items = [u.fullName, u.email, u.username].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return items.join(' • ');
}

function compareUsersByDisplayName(a: ExistingUserOption, b: ExistingUserOption): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) {
    return byName;
  }
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

function sortUserDirectory(users: readonly ExistingUserOption[]): ExistingUserOption[] {
  return [...users].sort(compareUsersByDisplayName);
}

function buildDecisionMap(decisions: readonly ImportUserDecision[]): Map<string, ImportUserDecision> {
  const out = new Map<string, ImportUserDecision>();
  for (const d of decisions) {
    out.set(d.sourceUserId, d);
  }
  return out;
}

function resolveImportedUserSortKey(u: ImportPreflightUser): string {
  return normalize(u.fullName) || normalize(u.email) || normalize(u.username) || normalize(u.sourceUserId);
}

function isUnresolvedUser(u: ImportPreflightUser, decisionBySourceId: Map<string, ImportUserDecision>): boolean {
  const d = decisionBySourceId.get(u.sourceUserId);
  return d == null || (d.mappedUserId == null && d.discard !== true);
}

const DIRECTORY_PAGE_LIMIT = 100;
const IMPORT_MAPPING_ROW_PX = 88;

const ImportMappingCells = memo(function ImportMappingCells(props: {
  readonly user: ImportPreflightUser;
  readonly mappedUserId: string | undefined;
  readonly options: readonly ExistingUserSelectOption[];
  readonly onChangeMappedUser: (sourceUserId: string, mappedUserId: string | undefined) => void;
}) {
  const { user, mappedUserId, options, onChangeMappedUser } = props;
  return (
    <>
      <td style={{ verticalAlign: 'top', padding: '10px 12px' }}>
        <Stack gap={2}>
          <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
            {renderIdentity(user) || user.sourceUserId}
          </Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            Source user id: {user.sourceUserId}
          </Text>
        </Stack>
      </td>
      <td style={{ verticalAlign: 'top', padding: '10px 12px' }}>
        <Select
          placeholder="Map to application user"
          value={mappedUserId ?? ''}
          onChange={(v) => {
            const nextMappedUserId = typeof v === 'string' && v.trim() !== '' ? v : undefined;
            onChangeMappedUser(user.sourceUserId, nextMappedUserId);
          }}
          data={options}
          searchable
          clearable
          nothingFoundMessage="No matching users"
          style={{ width: '100%' }}
          comboboxProps={{ withinPortal: false }}
        />
      </td>
    </>
  );
});

const ImportMappingDataTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
  ({ style, children, ...props }, ref) => (
    <table
      ref={ref}
      {...props}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        ...style,
      }}
    >
      <colgroup>
        <col style={{ width: '42%' }} />
        <col style={{ width: '58%' }} />
      </colgroup>
      {children}
    </table>
  ),
);
ImportMappingDataTable.displayName = 'ImportMappingDataTable';

const ImportMappingTableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ style, ...rest }, ref) => (
    <tr
      {...rest}
      ref={ref}
      style={{
        ...style,
        height: IMPORT_MAPPING_ROW_PX,
        boxSizing: 'border-box',
      }}
    />
  ),
);
ImportMappingTableRow.displayName = 'ImportMappingTableRow';

const importMappingVirtuosoComponents = {
  Table: ImportMappingDataTable,
  TableRow: ImportMappingTableRow,
};

export function ImportUserManagementTab({
  users,
  decisions,
  policy,
  onChangeDecisions,
  onChangePolicy,
  onFinalMappingChange,
}: ImportUserManagementTabProps) {
  const [directoryUsers, setDirectoryUsers] = useState<ExistingUserOption[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
  const [directoryNextCursor, setDirectoryNextCursor] = useState<string | undefined>(undefined);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [importedFilterQuery, setImportedFilterQuery] = useState('');

  const decisionBySourceId = useMemo(() => {
    return buildDecisionMap(decisions);
  }, [decisions]);

  const upsertDecision = useCallback((next: ImportUserDecision): void => {
    const filtered = decisions.filter((d) => d.sourceUserId !== next.sourceUserId);
    onChangeDecisions([...filtered, next]);
  }, [decisions, onChangeDecisions]);

  const loadDirectory = useCallback(async (query: string, cursor?: string): Promise<void> => {
    if (cursor != null) {
      setDirectoryLoadingMore(true);
    } else {
      setDirectoryLoading(true);
    }
    try {
      const response = await api.searchUsers(query, {
        limit: DIRECTORY_PAGE_LIMIT,
        ...(cursor != null ? { cursor } : {}),
      });
      const newUsers = ((response.users as ExistingUserOption[]) ?? []).map((u) => ({
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
      }));
      if (cursor != null) {
        setDirectoryUsers((prev) => {
          const seen = new Set(prev.map((x) => x._id));
          const merged = [...prev];
          for (const u of newUsers) {
            if (!seen.has(u._id)) {
              seen.add(u._id);
              merged.push(u);
            }
          }
          return sortUserDirectory(merged);
        });
      } else {
        setDirectoryUsers(sortUserDirectory(newUsers));
      }
      setDirectoryNextCursor(
        typeof response.nextCursor === 'string' && response.nextCursor.trim() !== ''
          ? response.nextCursor
          : undefined,
      );
    } finally {
      setDirectoryLoading(false);
      setDirectoryLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory(directoryQuery);
  }, [directoryQuery, loadDirectory]);

  const autoMatchUsers = useCallback((): void => {
    const sortedImported = [...users].sort((a, b) =>
      resolveImportedUserSortKey(a).localeCompare(resolveImportedUserSortKey(b), undefined, {
        sensitivity: 'base',
      }),
    );
    const sortedDirectory = sortUserDirectory(directoryUsers);
    const directoryById = new Map(sortedDirectory.map((u) => [u._id, u] as const));
    const reservedTargetIds = new Set<string>();
    const nextBySourceId = new Map<string, ImportUserDecision>();

    for (const d of decisions) {
      if (d.mappedUserId != null && directoryById.has(d.mappedUserId)) {
        reservedTargetIds.add(d.mappedUserId);
      }
      nextBySourceId.set(d.sourceUserId, d);
    }

    for (const importedUser of sortedImported) {
      const current = nextBySourceId.get(importedUser.sourceUserId);
      if (current?.mappedUserId != null && directoryById.has(current.mappedUserId)) {
        continue;
      }

      const emailNeedle = normalize(importedUser.email);
      const nameNeedle = normalize(importedUser.fullName);
      const emailMatches =
        emailNeedle === ''
          ? []
          : sortedDirectory.filter(
              (candidate) => normalize(candidate.email) === emailNeedle && !reservedTargetIds.has(candidate._id),
            );
      const nameMatches =
        nameNeedle === ''
          ? []
          : sortedDirectory.filter(
              (candidate) =>
                normalize(candidate.displayName) === nameNeedle && !reservedTargetIds.has(candidate._id),
            );
      const resolved = emailMatches.length === 1 ? emailMatches[0] : nameMatches.length === 1 ? nameMatches[0] : null;
      if (resolved != null) {
        reservedTargetIds.add(resolved._id);
        nextBySourceId.set(importedUser.sourceUserId, {
          sourceUserId: importedUser.sourceUserId,
          mappedUserId: resolved._id,
        });
      }
    }

    const next: ImportUserDecision[] = users.map((u) => nextBySourceId.get(u.sourceUserId) ?? { sourceUserId: u.sourceUserId });
    onChangeDecisions(next);
  }, [decisions, directoryUsers, onChangeDecisions, users]);

  const handleChangeMappedUser = useCallback((sourceUserId: string, mappedUserId: string | undefined): void => {
    upsertDecision({
      sourceUserId,
      ...(mappedUserId != null ? { mappedUserId } : {}),
    });
  }, [upsertDecision]);

  const unresolvedCount = users.filter((u) => {
    return isUnresolvedUser(u, decisionBySourceId);
  }).length;

  const sortedDisplayUsers = useMemo(() => {
    const filtered = users.filter((u) => {
      const q = normalize(importedFilterQuery);
      if (q === '') {
        return true;
      }
      return (
        normalize(u.fullName).includes(q) ||
        normalize(u.email).includes(q) ||
        normalize(u.username).includes(q) ||
        normalize(u.sourceUserId).includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const aDecision = decisionBySourceId.get(a.sourceUserId);
      const bDecision = decisionBySourceId.get(b.sourceUserId);
      const aMapped = aDecision?.mappedUserId != null;
      const bMapped = bDecision?.mappedUserId != null;
      if (aMapped !== bMapped) {
        return aMapped ? -1 : 1;
      }
      return resolveImportedUserSortKey(a).localeCompare(resolveImportedUserSortKey(b), undefined, {
        sensitivity: 'base',
      });
    });
  }, [decisionBySourceId, importedFilterQuery, users]);

  const usedMappedUserIds = useMemo(() => {
    const bySource = buildDecisionMap(decisions);
    const out = new Set<string>();
    for (const u of users) {
      const mapped = bySource.get(u.sourceUserId)?.mappedUserId;
      if (typeof mapped === 'string' && mapped.trim() !== '') {
        out.add(mapped);
      }
    }
    return out;
  }, [decisions, users]);

  const getDirectoryOptionsForRow = useCallback(
    (sourceUserId: string): ExistingUserSelectOption[] => {
      const rowMapped = decisionBySourceId.get(sourceUserId)?.mappedUserId;
      return directoryUsers
        .filter((x) => rowMapped === x._id || !usedMappedUserIds.has(x._id))
        .map((x) => ({
          value: x._id,
          label: `${x.displayName} (${x.email})`,
        }));
    },
    [decisionBySourceId, directoryUsers, usedMappedUserIds],
  );

  const finalMapping = useMemo<ImportUserDecision[]>(
    () =>
      users.map((u) => {
        const d = decisionBySourceId.get(u.sourceUserId);
        return {
          sourceUserId: u.sourceUserId,
          ...(typeof d?.mappedUserId === 'string' && d.mappedUserId.trim() !== ''
            ? { mappedUserId: d.mappedUserId }
            : {}),
          ...(policy === 'discard_unmapped' &&
          (d == null || (d.mappedUserId == null && d.discard !== true))
            ? { discard: true }
            : d?.discard === true
              ? { discard: true }
              : {}),
        };
      }),
    [decisionBySourceId, policy, users],
  );

  useEffect(() => {
    onFinalMappingChange?.(finalMapping);
  }, [finalMapping, onFinalMappingChange]);

  if (users.length === 0) {
    return (
      <Alert color="green" radius="md">
        No import users detected in this file.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Alert color="blue" radius="md">
        Map imported users to existing app users before import starts. Mapped users are shown first, with
        unresolved users listed underneath.
      </Alert>

      <Paper withBorder radius="md" p="md">
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Fallback for unresolved users
          </Text>
          <Select
            value={policy}
            onChange={(v) => onChangePolicy((v as UnmappedUserPolicy) ?? 'map_to_importer')}
            data={[
              { value: 'map_to_importer', label: 'Map unresolved users to importer' },
              { value: 'discard_unmapped', label: 'Discard unresolved users' },
            ]}
          />
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                autoMatchUsers();
              }}
              disabled={directoryLoading}
            >
              Auto-Match Users
            </Button>
            <Button
              size="xs"
              variant="subtle"
              loading={directoryLoading}
              onClick={() => {
                void loadDirectory(directoryQuery);
              }}
            >
              Refresh user directory
            </Button>
          </Group>
          <Text size="xs" c={unresolvedCount > 0 ? 'orange' : 'green'}>
            {unresolvedCount} unresolved user(s)
          </Text>
        </Stack>
      </Paper>

      <Group grow align="end" wrap="wrap">
        <BoardMemberEnterToSearchField
          ariaLabel="Search imported users"
          placeholder="Filter imported users..."
          onCommit={setImportedFilterQuery}
        />
        <BoardMemberEnterToSearchField
          ariaLabel="Search existing app users"
          placeholder="Search existing users..."
          onCommit={setDirectoryQuery}
        />
      </Group>

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              User mapping table
            </Text>
            <Group gap="xs">
              {directoryLoading ? <Loader size="xs" /> : null}
              {directoryNextCursor != null ? (
                <Button
                  size="xs"
                  variant="light"
                  loading={directoryLoadingMore}
                  onClick={() => {
                    void loadDirectory(directoryQuery, directoryNextCursor);
                  }}
                >
                  Load more users
                </Button>
              ) : null}
            </Group>
          </Group>

          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Imported Users (from file)</Table.Th>
                <Table.Th>Application Users (search and map)</Table.Th>
              </Table.Tr>
            </Table.Thead>
          </Table>
          <div style={{ height: '58vh', minHeight: 320 }}>
            <TableVirtuoso
              style={{ height: '100%', width: '100%' }}
              data={sortedDisplayUsers}
              components={importMappingVirtuosoComponents}
              computeItemKey={(_index, user) => user.sourceUserId}
              fixedItemHeight={IMPORT_MAPPING_ROW_PX}
              overscan={8}
              itemContent={(_index, u) => {
                const rowDecision = decisionBySourceId.get(u.sourceUserId);
                return (
                  <ImportMappingCells
                    user={u}
                    mappedUserId={rowDecision?.mappedUserId}
                    options={getDirectoryOptionsForRow(u.sourceUserId)}
                    onChangeMappedUser={handleChangeMappedUser}
                  />
                );
              }}
            />
          </div>
        </Stack>
      </Paper>
    </Stack>
  );
}

