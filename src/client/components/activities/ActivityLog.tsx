import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconHistory,
  IconUserMinus,
  IconUserPlus,
  IconUsersGroup,
} from '@tabler/icons-react';
import { Virtuoso } from 'react-virtuoso';
import { eachDayOfInterval, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { api } from '../../utils/api.js';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardMemberAuditActivities.js';
import './activityLog.css';

/** When retention is "never", limit date-based pages to the longest finite retention preset (1 year). */
const MEMBER_AUDIT_DATE_PAGE_SPAN_NEVER_DAYS = 365;

const RETENTION_OPTIONS = [
  { value: 'never', label: 'Never expire' },
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const;

interface ActivityLogProps {
  boardId: string;
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void;
}

type MemberAuditActivityType =
  | 'board.member.add'
  | 'board.member.remove'
  | 'board.member.role.update';

interface ParsedActivityRow {
  readonly id: string;
  readonly type: MemberAuditActivityType;
  readonly createdAt: Date;
  readonly actorName: string;
  readonly meta: Record<string, unknown>;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function readId(raw: Record<string, unknown>): string {
  const id = raw._id;
  if (typeof id === 'string') {
    return id;
  }
  if (id != null && typeof id === 'object' && '$oid' in id && typeof (id as { $oid: unknown }).$oid === 'string') {
    return (id as { $oid: string }).$oid;
  }
  return id != null ? String(id) : '';
}

function parseRow(raw: unknown): ParsedActivityRow | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (
    type !== 'board.member.add' &&
    type !== 'board.member.remove' &&
    type !== 'board.member.role.update'
  ) {
    return null;
  }
  const createdRaw = o.createdAt;
  const createdAt =
    createdRaw instanceof Date
      ? createdRaw
      : new Date(typeof createdRaw === 'string' || typeof createdRaw === 'number' ? createdRaw : '');
  if (!Number.isFinite(createdAt.getTime())) {
    return null;
  }

  const userIdField = o.userId;
  let actorName = 'Unknown user';
  if (userIdField != null && typeof userIdField === 'object' && !Array.isArray(userIdField)) {
    const u = userIdField as { displayName?: string };
    actorName = u.displayName != null && u.displayName !== '' ? u.displayName : 'Unknown user';
  }

  const meta = o.metadata;
  const metaRec =
    meta != null && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};

  return {
    id: readId(o) || `row-${createdAt.getTime()}`,
    type,
    createdAt,
    actorName,
    meta: metaRec,
  };
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge size="sm" variant="light" color="gray" radius="sm" tt="none" fw={500}>
      {role}
    </Badge>
  );
}

const EntryBody = memo(function EntryBody({
  row,
  resolveRoleLabel,
}: {
  row: ParsedActivityRow;
  resolveRoleLabel: (roleKey: string) => string;
}) {
  const target = readString(row.meta, 'targetDisplayName') ?? 'Unknown user';
  const roleKey = readString(row.meta, 'roleKey') ?? readString(row.meta, 'role') ?? '';
  const prevRoleKey =
    readString(row.meta, 'previousRoleKey') ?? readString(row.meta, 'previousRole') ?? '';
  const newRoleKey = readString(row.meta, 'newRoleKey') ?? readString(row.meta, 'newRole') ?? '';
  const viaInvite = row.meta.viaInvite === true;

  if (row.type === 'board.member.add') {
    if (viaInvite) {
      return (
        <Text component="div" size="sm">
          <Text component="span" fw={700}>
            {row.actorName}
          </Text>{' '}
          joined using an invite as {roleKey !== '' ? <RoleBadge role={resolveRoleLabel(roleKey)} /> : 'member'}
        </Text>
      );
    }
    return (
      <Text component="div" size="sm">
        <Text component="span" fw={700}>
          {row.actorName}
        </Text>{' '}
        added{' '}
        <Text component="span" fw={700}>
          {target}
        </Text>{' '}
        as {roleKey !== '' ? <RoleBadge role={resolveRoleLabel(roleKey)} /> : 'member'}
      </Text>
    );
  }

  if (row.type === 'board.member.remove') {
    return (
      <Text size="sm">
        <Text component="span" fw={700}>
          {row.actorName}
        </Text>{' '}
        removed{' '}
        <Text component="span" fw={700}>
          {target}
        </Text>{' '}
        from the board
      </Text>
    );
  }

  return (
    <Text component="div" size="sm">
      <Text component="span" fw={700}>
        {row.actorName}
      </Text>{' '}
      changed{' '}
      <Text component="span" fw={700}>
        {target}
      </Text>
      &apos;s role from {prevRoleKey !== '' ? <RoleBadge role={resolveRoleLabel(prevRoleKey)} /> : '—'} to{' '}
      {newRoleKey !== '' ? <RoleBadge role={resolveRoleLabel(newRoleKey)} /> : '—'}
    </Text>
  );
});

function EntryIcon({ type }: { type: MemberAuditActivityType }) {
  if (type === 'board.member.add') {
    return (
      <ThemeIcon className="board-member-activity-log__entry-icon" size="lg" radius="md" variant="light" color="green">
        <IconUserPlus size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type === 'board.member.remove') {
    return (
      <ThemeIcon className="board-member-activity-log__entry-icon" size="lg" radius="md" variant="light" color="red">
        <IconUserMinus size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  return (
    <ThemeIcon className="board-member-activity-log__entry-icon" size="lg" radius="md" variant="light" color="blue">
      <IconUsersGroup size={20} stroke={1.5} />
    </ThemeIcon>
  );
}

const ActivityLogEntryRow = memo(function ActivityLogEntryRow({
  row,
  resolveRoleLabel,
}: {
  readonly row: ParsedActivityRow;
  readonly resolveRoleLabel: (roleKey: string) => string;
}) {
  return (
    <Box className="board-member-activity-log__entry">
      <Group align="flex-start" gap="md" wrap="nowrap">
        <EntryIcon type={row.type} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <EntryBody row={row} resolveRoleLabel={resolveRoleLabel} />
          <Text size="xs" c="dimmed">
            {format(row.createdAt, 'MMM d, yyyy, h:mm a')}
          </Text>
        </Stack>
      </Group>
    </Box>
  );
});

function memberAuditRetentionSpanDays(retentionValue: string): number {
  if (retentionValue === 'never') {
    return MEMBER_AUDIT_DATE_PAGE_SPAN_NEVER_DAYS;
  }
  const n = parseInt(retentionValue, 10);
  return Number.isFinite(n) && n > 0 ? n : BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS;
}

export function ActivityLog({ boardId, onSettingsLivePatch }: ActivityLogProps) {
  const [calendarAnchor, setCalendarAnchor] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [activities, setActivities] = useState<ParsedActivityRow[]>([]);
  const [totalForDay, setTotalForDay] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [retentionValue, setRetentionValue] = useState<string>(
    String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS),
  );
  const [savingRetention, setSavingRetention] = useState(false);
  const [roleLabelByKey, setRoleLabelByKey] = useState<Record<string, string>>({});

  const retentionSpanDays = useMemo(() => memberAuditRetentionSpanDays(retentionValue), [retentionValue]);

  const datePages = useMemo(() => {
    const end = startOfDay(new Date(calendarAnchor));
    const start = startOfDay(subDays(end, retentionSpanDays - 1));
    const ascending = eachDayOfInterval({ start, end });
    return ascending.slice().reverse();
  }, [retentionSpanDays, calendarAnchor]);

  useEffect(() => {
    setCalendarAnchor(Date.now());
  }, [boardId, retentionValue]);

  useEffect(() => {
    setSelectedDayIndex((i) => Math.min(Math.max(0, i), Math.max(0, datePages.length - 1)));
  }, [datePages]);

  const retentionSelectData = useMemo(() => {
    const preset = new Set<string>(RETENTION_OPTIONS.map((o) => o.value));
    if (retentionValue !== 'never' && !preset.has(retentionValue)) {
      return [...RETENTION_OPTIONS, { value: retentionValue, label: `${retentionValue} days` }];
    }
    return [...RETENTION_OPTIONS];
  }, [retentionValue]);

  const loadBoardRetention = useCallback(async () => {
    try {
      const res = await api.getBoard(boardId);
      const board = res.board as { settings?: { memberActivityLogRetentionDays?: number } } | null;
      const days = board?.settings?.memberActivityLogRetentionDays;
      if (days === undefined) {
        setRetentionValue(String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS));
      } else {
        setRetentionValue(days === null ? 'never' : String(days));
      }
    } catch {
      setRetentionValue(String(BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS));
    }
  }, [boardId]);

  const selectedDayStartMs = useMemo(() => {
    const d = datePages[selectedDayIndex];
    return d !== undefined ? startOfDay(d).getTime() : NaN;
  }, [datePages, selectedDayIndex]);

  const loadActivities = useCallback(async () => {
    if (!Number.isFinite(selectedDayStartMs)) {
      setActivities([]);
      setTotalForDay(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setForbidden(false);
      const dayStart = new Date(selectedDayStartMs);
      const dayEnd = endOfDay(dayStart);
      const data = await api.getBoardActivities(boardId, {
        memberAudit: true,
        dayStartMs: dayStart.getTime(),
        dayEndMs: dayEnd.getTime(),
      });
      if (!('total' in data)) {
        setActivities([]);
        setTotalForDay(0);
        return;
      }
      const rows = data.activities
        .map(parseRow)
        .filter((r): r is ParsedActivityRow => r !== null);
      setActivities(rows);
      setTotalForDay(data.total);
    } catch (err: unknown) {
      const ax = err as AxiosError;
      if (ax.response?.status === 403) {
        setForbidden(true);
      }
      setActivities([]);
      setTotalForDay(0);
    } finally {
      setLoading(false);
    }
  }, [boardId, selectedDayStartMs]);

  useEffect(() => {
    void loadBoardRetention();
  }, [loadBoardRetention]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getBoardAssignableRoles(boardId)
      .then((r) => {
        if (cancelled) return;
        const roles = Array.isArray(r.roles) ? r.roles : [];
        const mapped: Record<string, string> = {
          admin: 'Admin',
          manager: 'Manager',
          viewer: 'Viewer',
        };
        for (const role of roles) {
          if (typeof role?.key === 'string' && role.key.trim() !== '') {
            mapped[role.key.trim()] =
              typeof role.displayName === 'string' && role.displayName.trim() !== ''
                ? role.displayName.trim()
                : role.key.trim();
          }
        }
        setRoleLabelByKey(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setRoleLabelByKey({ admin: 'Admin', manager: 'Manager', viewer: 'Viewer' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const resolveRoleLabel = useCallback(
    (roleKey: string) => roleLabelByKey[roleKey] ?? roleKey,
    [roleLabelByKey],
  );

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleRetentionChange = async (value: string | null): Promise<void> => {
    if (value == null) {
      return;
    }
    const prev = retentionValue;
    setRetentionValue(value);
    setSavingRetention(true);
    try {
      const days = value === 'never' ? null : parseInt(value, 10);
      if (value !== 'never' && !Number.isFinite(days)) {
        setRetentionValue(prev);
        return;
      }
      await api.updateBoard(boardId, {
        settings: {
          memberActivityLogRetentionDays: days,
        },
      });
      setSelectedDayIndex(0);
      if (days === null) {
        onSettingsLivePatch?.({ memberActivityLogRetentionDays: null });
      } else {
        onSettingsLivePatch?.({ memberActivityLogRetentionDays: days });
      }
    } catch {
      setRetentionValue(prev);
    } finally {
      setSavingRetention(false);
    }
  };

  const dayPagesTotal = datePages.length;
  const canGoNewer = selectedDayIndex > 0;
  const canGoOlder = selectedDayIndex < dayPagesTotal - 1;
  const dayLabel = useMemo(() => {
    const d = datePages[selectedDayIndex];
    return d !== undefined ? format(d, 'EEE, MMM d, yyyy') : '—';
  }, [datePages, selectedDayIndex]);

  if (forbidden) {
    return (
      <Alert color="yellow" title="No access">
        Only board admins and managers can view the member activity log.
      </Alert>
    );
  }

  return (
    <Box className="board-member-activity-log">
      <Group className="board-member-activity-log__header" gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon size="lg" radius="md" variant="light" color="blue" aria-hidden>
          <IconHistory size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={2}>
          <Title order={4}>Member Activity Log</Title>
          <Text size="sm" c="dimmed">
            Track who added, removed, or changed roles for board members
          </Text>
        </Stack>
      </Group>

      <Box className="board-member-activity-log__surface">
        <Card
          className="board-member-activity-log__card board-member-activity-log__retention"
          padding="md"
          radius="md"
          withBorder
          shadow="none"
        >
          <Group justify="space-between" align="center" wrap="nowrap" gap="md">
            <Group gap="md" wrap="nowrap" align="flex-start">
              <ThemeIcon size="lg" radius="md" variant="light" color="gray" aria-hidden>
                <IconClock size={20} stroke={1.5} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  Log Retention
                </Text>
                <Text size="xs" c="dimmed">
                  Automatically delete old entries to manage database size
                </Text>
              </Stack>
            </Group>
            <Select
              aria-label="Member activity log retention"
              data={retentionSelectData}
              value={retentionValue}
              onChange={(v) => {
                void handleRetentionChange(v);
              }}
              disabled={savingRetention}
              w={{ base: '100%', sm: 200 }}
              miw={160}
            />
          </Group>
        </Card>

        <Box
          className={
            loading
              ? 'board-member-activity-log__scroll board-member-activity-log__scroll--center'
              : 'board-member-activity-log__scroll board-member-activity-log__virtuoso-host'
          }
        >
          {loading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : totalForDay === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              No member activity on {dayLabel}.
            </Text>
          ) : (
            <Virtuoso
              className="board-member-activity-log__virtuoso"
              style={{ flex: 1, minHeight: 200 }}
              data={activities}
              computeItemKey={(_, row) => row.id}
              defaultItemHeight={96}
              itemContent={(_index, row) => (
                <ActivityLogEntryRow row={row} resolveRoleLabel={resolveRoleLabel} />
              )}
            />
          )}
        </Box>

        <Group
          className="board-member-activity-log__footer"
          justify="space-between"
          align="center"
          wrap="wrap"
          gap="sm"
        >
          <Text size="sm" c="dimmed">
            Day {selectedDayIndex + 1} of {dayPagesTotal} · {dayLabel} · {totalForDay}{' '}
            {totalForDay === 1 ? 'entry' : 'entries'}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button
              type="button"
              variant="default"
              size="sm"
              leftSection={<IconChevronLeft size={16} stroke={1.75} aria-hidden />}
              disabled={!canGoNewer || loading}
              onClick={() => {
                setSelectedDayIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              rightSection={<IconChevronRight size={16} stroke={1.75} aria-hidden />}
              disabled={!canGoOlder || loading || dayPagesTotal === 0}
              onClick={() => {
                setSelectedDayIndex((i) => Math.min(dayPagesTotal - 1, i + 1));
              }}
            >
              Next
            </Button>
          </Group>
        </Group>
      </Box>
    </Box>
  );
}
