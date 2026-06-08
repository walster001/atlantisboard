import { memo } from 'react';
import { Badge, Box, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconUserMinus,
  IconUserPlus,
  IconUsersGroup,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardMemberAuditActivities.js';

export const MEMBER_AUDIT_DATE_PAGE_SPAN_NEVER_DAYS = 365;

export const RETENTION_OPTIONS = [
  { value: 'never', label: 'Never expire' },
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const;

export type MemberAuditActivityType =
  | 'board.member.add'
  | 'board.member.remove'
  | 'board.member.role.update';

export interface ParsedActivityRow {
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

export function parseActivityLogRow(raw: unknown): ParsedActivityRow | null {
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
  const viaPlaceholder = row.meta.viaPlaceholder === true;

  if (row.type === 'board.member.add') {
    if (viaPlaceholder) {
      return (
        <Text component="div" size="sm">
          <Text component="span" fw={700}>
            {row.actorName}
          </Text>{' '}
          joined the board via placeholder with{' '}
          {roleKey !== '' ? <RoleBadge role={resolveRoleLabel(roleKey)} /> : 'member'}
        </Text>
      );
    }
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

export const ActivityLogEntryRow = memo(function ActivityLogEntryRow({
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

export function memberAuditRetentionSpanDays(retentionValue: string): number {
  if (retentionValue === 'never') {
    return MEMBER_AUDIT_DATE_PAGE_SPAN_NEVER_DAYS;
  }
  const n = parseInt(retentionValue, 10);
  return Number.isFinite(n) && n > 0 ? n : BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS;
}
