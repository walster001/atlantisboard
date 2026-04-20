import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import {
  type ImportPreflightUser,
  type ImportUserDecision,
  type UnmappedUserPolicy,
} from '../../../shared/import/importPreflight.js';
import { api } from '../../utils/api.js';

interface ExistingUserOption {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
}

interface ImportUserManagementTabProps {
  readonly users: readonly ImportPreflightUser[];
  readonly decisions: readonly ImportUserDecision[];
  readonly policy: UnmappedUserPolicy;
  readonly onChangeDecisions: (next: readonly ImportUserDecision[]) => void;
  readonly onChangePolicy: (next: UnmappedUserPolicy) => void;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function renderIdentity(u: ImportPreflightUser): string {
  const items = [u.fullName, u.email, u.username].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return items.join(' • ');
}

export function ImportUserManagementTab({
  users,
  decisions,
  policy,
  onChangeDecisions,
  onChangePolicy,
}: ImportUserManagementTabProps) {
  const [directoryBySourceUserId, setDirectoryBySourceUserId] = useState<Record<string, ExistingUserOption[]>>({});
  const [loadingBySourceUserId, setLoadingBySourceUserId] = useState<Record<string, boolean>>({});

  const decisionBySourceId = useMemo(() => {
    const map = new Map<string, ImportUserDecision>();
    for (const d of decisions) {
      map.set(d.sourceUserId, d);
    }
    return map;
  }, [decisions]);

  const upsertDecision = (next: ImportUserDecision): void => {
    const filtered = decisions.filter((d) => d.sourceUserId !== next.sourceUserId);
    onChangeDecisions([...filtered, next]);
  };

  const handleSearch = async (u: ImportPreflightUser): Promise<void> => {
    setLoadingBySourceUserId((prev) => ({ ...prev, [u.sourceUserId]: true }));
    try {
      const q = u.email ?? u.fullName ?? u.username ?? '';
      if (q.trim() === '') {
        setDirectoryBySourceUserId((prev) => ({ ...prev, [u.sourceUserId]: [] }));
        return;
      }
      const response = await api.searchUsers(q, { limit: 20 });
      const directory = (response.users as ExistingUserOption[]) ?? [];
      setDirectoryBySourceUserId((prev) => ({ ...prev, [u.sourceUserId]: directory }));

      // Auto-map exact email/fullname when unique.
      const emailNeedle = normalize(u.email);
      const nameNeedle = normalize(u.fullName);
      const emailHits =
        emailNeedle === '' ? [] : directory.filter((x) => normalize(x.email) === emailNeedle);
      const nameHits =
        nameNeedle === ''
          ? []
          : directory.filter((x) => normalize(x.displayName) === nameNeedle);
      const unique = emailHits.length === 1 ? emailHits[0] : nameHits.length === 1 ? nameHits[0] : null;
      if (unique != null) {
        upsertDecision({
          sourceUserId: u.sourceUserId,
          mappedUserId: unique._id,
        });
      }
    } finally {
      setLoadingBySourceUserId((prev) => ({ ...prev, [u.sourceUserId]: false }));
    }
  };

  const unresolvedCount = users.filter((u) => {
    const d = decisionBySourceId.get(u.sourceUserId);
    return d == null || (d.mappedUserId == null && d.discard !== true);
  }).length;

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
        Map imported users to existing app users before import starts. Unresolved users follow your selected
        fallback policy.
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
              { value: 'create_placeholders', label: 'Create placeholder users (legacy fallback)' },
            ]}
          />
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                const next = users.map<ImportUserDecision>((u) => ({
                  sourceUserId: u.sourceUserId,
                  discard: true,
                }));
                onChangeDecisions(next);
              }}
            >
              Discard all
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                const next = users.map<ImportUserDecision>((u) => ({
                  sourceUserId: u.sourceUserId,
                }));
                onChangeDecisions(next);
                onChangePolicy('map_to_importer');
              }}
            >
              Map all unresolved to importer
            </Button>
          </Group>
          <Text size="xs" c={unresolvedCount > 0 ? 'orange' : 'green'}>
            {unresolvedCount} unresolved user(s)
          </Text>
        </Stack>
      </Paper>

      {users.map((u) => {
        const rowDecision = decisionBySourceId.get(u.sourceUserId);
        const directory = directoryBySourceUserId[u.sourceUserId] ?? [];
        return (
          <Paper key={u.sourceUserId} withBorder radius="md" p="md">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                {renderIdentity(u) || u.sourceUserId}
              </Text>
              <Text size="xs" c="dimmed">
                Source user id: {u.sourceUserId}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  loading={loadingBySourceUserId[u.sourceUserId] === true}
                  onClick={() => {
                    void handleSearch(u);
                  }}
                >
                  Auto-match / refresh candidates
                </Button>
                <Button
                  size="xs"
                  variant={rowDecision?.discard === true ? 'filled' : 'default'}
                  {...(rowDecision?.discard === true ? { color: 'red' as const } : {})}
                  onClick={() => {
                    upsertDecision({ sourceUserId: u.sourceUserId, discard: true });
                  }}
                >
                  Discard
                </Button>
              </Group>
              <Select
                placeholder="Map to existing user"
                value={rowDecision?.mappedUserId ?? ''}
                onChange={(v) => {
                  const mappedUserId = typeof v === 'string' && v.trim() !== '' ? v : undefined;
                  upsertDecision({
                    sourceUserId: u.sourceUserId,
                    ...(mappedUserId != null ? { mappedUserId } : {}),
                  });
                }}
                data={directory.map((x) => ({
                  value: x._id,
                  label: `${x.displayName} (${x.email})`,
                }))}
                searchable
                clearable
                nothingFoundMessage="Run auto-match first"
              />
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

