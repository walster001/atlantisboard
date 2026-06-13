import { memo } from 'react';
import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowsMove,
  IconBell,
  IconCalendar,
  IconChecklist,
  IconClipboardText,
  IconFile,
  IconLabel,
  IconLayoutList,
  IconMessage,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import {
  isBoardContentActivityType,
  type BoardContentActivityType,
} from '../../../shared/constants/boardContentActivities.js';

export interface ParsedBoardActivityRow {
  readonly id: string;
  readonly type: BoardContentActivityType;
  readonly createdAt: Date;
  readonly actorName: string;
  readonly meta: Record<string, unknown>;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
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

const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Hide raw Mongo ids in user-facing log text (legacy rows may store ids in previous/next). */
export function humanReadableLabel(value: string | undefined, fallback = '—'): string {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const trimmed = value.trim();
  if (MONGO_OBJECT_ID_RE.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function entityName(meta: Record<string, unknown>, fallback = 'item'): string {
  return (
    readString(meta, 'entityName') ??
    readString(meta, 'cardTitle') ??
    readString(meta, 'listName') ??
    readString(meta, 'labelName') ??
    readString(meta, 'checklistName') ??
    readString(meta, 'fileName') ??
    fallback
  );
}

export function listLabelFromMeta(
  meta: Record<string, unknown>,
  nameKey: 'previousListName' | 'nextListName' | 'listName',
  idFallbackKey?: 'previous' | 'next',
): string {
  const named = readString(meta, nameKey);
  if (named != null) {
    return humanReadableLabel(named, 'Unknown list');
  }
  if (idFallbackKey != null) {
    return humanReadableLabel(readString(meta, idFallbackKey), 'Unknown list');
  }
  return 'Unknown list';
}

function formatFieldLabel(field: string | undefined): string | undefined {
  if (field == null) return undefined;
  const labels: Record<string, string> = {
    startDate: 'Start date',
    dueDate: 'Due date',
    endDate: 'End date',
    completedAt: 'Completed date',
    title: 'Title',
    name: 'Name',
    description: 'Description',
    position: 'Position',
    color: 'Color',
  };
  return labels[field] ?? field;
}

function Actor({ name }: { name: string }) {
  return (
    <Text component="span" fw={700}>
      {name}
    </Text>
  );
}

function Entity({ name }: { name: string }) {
  return (
    <Text component="span" fw={600} fs="italic">
      {name}
    </Text>
  );
}

function Verb({ text }: { text: string }) {
  return (
    <Text component="span" fw={600}>
      {text}
    </Text>
  );
}

function Highlight({ value }: { value: string | undefined }) {
  if (value == null || value === '') {
    return <Text component="span">—</Text>;
  }
  return (
    <Text component="span" fw={600}>
      {value}
    </Text>
  );
}

const ACTIVITY_VERB: Partial<Record<BoardContentActivityType, string>> = {
  'list.created': 'created list',
  'list.updated': 'updated list',
  'list.deleted': 'deleted list',
  'list.reordered': 'reordered lists',
  'list.duplicated': 'duplicated list',
  'card.created': 'created card',
  'card.updated': 'updated card',
  'card.deleted': 'deleted card',
  'card.moved': 'moved card',
  'card.reordered': 'reordered cards',
  'card.duplicated': 'duplicated card',
  'card.description.updated': 'updated description on',
  'checklist.created': 'created checklist',
  'checklist.updated': 'updated checklist',
  'checklist.deleted': 'deleted checklist',
  'checklist.item.created': 'added checklist item to',
  'checklist.item.updated': 'updated checklist item on',
  'checklist.item.deleted': 'removed checklist item from',
  'attachment.uploaded': 'uploaded attachment to',
  'attachment.deleted': 'deleted attachment from',
  'label.created': 'created label',
  'label.updated': 'updated label',
  'label.deleted': 'deleted label',
  'label.assigned': 'assigned label to',
  'label.removed': 'removed label from',
  'comment.created': 'commented on',
  'comment.updated': 'edited comment on',
  'comment.deleted': 'deleted comment on',
  'card.assignee.added': 'assigned',
  'card.assignee.removed': 'unassigned',
  'card.reminder.created': 'added reminder to',
  'card.reminder.updated': 'updated reminder on',
  'card.reminder.deleted': 'deleted reminder on',
  'card.reminder.dismissed': 'dismissed reminder on',
  'card.dates.updated': 'changed',
};

export function parseBoardActivityRow(raw: unknown): ParsedBoardActivityRow | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (typeof type !== 'string' || !isBoardContentActivityType(type)) {
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

const EntryBody = memo(function EntryBody({ row }: { row: ParsedBoardActivityRow }) {
  const name = entityName(row.meta);
  const field = formatFieldLabel(readString(row.meta, 'field'));
  const previous = readString(row.meta, 'previous');
  const next = readString(row.meta, 'next');
  const assigneeName = readString(row.meta, 'assigneeDisplayName') ?? readString(row.meta, 'targetDisplayName');
  const verb = ACTIVITY_VERB[row.type] ?? row.type.replace(/\./g, ' ');

  if (row.type === 'card.moved') {
    const fromList = listLabelFromMeta(row.meta, 'previousListName', 'previous');
    const toList = listLabelFromMeta(row.meta, 'nextListName', 'next');
    const cardTitle = humanReadableLabel(
      readString(row.meta, 'cardTitle') ?? readString(row.meta, 'entityName') ?? name,
      'Untitled card',
    );
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text="moved" /> <Entity name={cardTitle} /> from{' '}
        <Highlight value={fromList} /> to <Highlight value={toList} />
      </Text>
    );
  }

  if (row.type === 'card.dates.updated' && field != null) {
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text="changed" /> <Highlight value={field} /> on <Entity name={name} /> from{' '}
        <Highlight value={previous} /> to <Highlight value={next} />
      </Text>
    );
  }

  if (
    (row.type === 'card.updated' || row.type === 'list.updated' || row.type === 'label.updated') &&
    field != null &&
    (previous != null || next != null)
  ) {
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text="changed" /> <Highlight value={field} /> on <Entity name={name} /> from{' '}
        <Highlight value={previous} /> to <Highlight value={next} />
      </Text>
    );
  }

  if (row.type.startsWith('checklist.item.')) {
    const itemText = humanReadableLabel(readString(row.meta, 'entityName'), 'item');
    const cardTitle = humanReadableLabel(readString(row.meta, 'cardTitle'), 'Untitled card');
    if (row.type === 'checklist.item.created') {
      return (
        <Text component="div" size="sm">
          <Actor name={row.actorName} /> <Verb text="added" /> <Entity name={itemText} /> to <Entity name={cardTitle} />
        </Text>
      );
    }
    if (row.type === 'checklist.item.updated') {
      return (
        <Text component="div" size="sm">
          <Actor name={row.actorName} /> <Verb text="updated" /> <Entity name={itemText} /> on <Entity name={cardTitle} />
        </Text>
      );
    }
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text="removed" /> <Entity name={itemText} /> from <Entity name={cardTitle} />
      </Text>
    );
  }

  if (row.type === 'card.assignee.added' || row.type === 'card.assignee.removed') {
    const action = row.type === 'card.assignee.added' ? 'assigned' : 'unassigned';
    const cardTitle = humanReadableLabel(
      readString(row.meta, 'cardTitle') ?? readString(row.meta, 'entityName') ?? name,
      'Untitled card',
    );
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text={action} />{' '}
        {assigneeName != null ? <Entity name={assigneeName} /> : 'a member'} on <Entity name={cardTitle} />
      </Text>
    );
  }

  if (row.type === 'label.assigned' || row.type === 'label.removed') {
    const label = readString(row.meta, 'labelName') ?? name;
    const card = readString(row.meta, 'cardTitle') ?? readString(row.meta, 'entityName');
    const action = row.type === 'label.assigned' ? 'assigned' : 'removed';
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text={action} /> <Entity name={label} />{' '}
        {row.type === 'label.assigned' ? 'to' : 'from'}{' '}
        {card != null ? <Entity name={card} /> : 'a card'}
      </Text>
    );
  }

  if (row.type.endsWith('.deleted')) {
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text={verb} /> <Entity name={name} />
      </Text>
    );
  }

  if (row.type.endsWith('.created') || row.type.endsWith('.uploaded')) {
    return (
      <Text component="div" size="sm">
        <Actor name={row.actorName} /> <Verb text={verb} /> <Entity name={name} />
      </Text>
    );
  }

  return (
    <Text component="div" size="sm">
      <Actor name={row.actorName} /> <Verb text={verb} /> <Entity name={name} />
    </Text>
  );
});

function EntryIcon({ type }: { type: BoardContentActivityType }) {
  const props = {
    className: 'board-day-log__entry-icon',
    size: 'lg' as const,
    radius: 'md' as const,
    variant: 'light' as const,
  };

  if (type.startsWith('list.')) {
    return (
      <ThemeIcon {...props} color="indigo">
        <IconLayoutList size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type === 'card.moved' || type === 'card.reordered' || type === 'list.reordered') {
    return (
      <ThemeIcon {...props} color="cyan">
        <IconArrowsMove size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('card.reminder')) {
    return (
      <ThemeIcon {...props} color="orange">
        <IconBell size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type === 'card.dates.updated') {
    return (
      <ThemeIcon {...props} color="violet">
        <IconCalendar size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('checklist')) {
    return (
      <ThemeIcon {...props} color="teal">
        <IconChecklist size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('attachment')) {
    return (
      <ThemeIcon {...props} color="grape">
        <IconFile size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('label')) {
    return (
      <ThemeIcon {...props} color="pink">
        <IconLabel size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('comment')) {
    return (
      <ThemeIcon {...props} color="blue">
        <IconMessage size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.startsWith('card.assignee')) {
    return (
      <ThemeIcon {...props} color="green">
        <IconUser size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type === 'card.description.updated') {
    return (
      <ThemeIcon {...props} color="gray">
        <IconClipboardText size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.endsWith('.deleted')) {
    return (
      <ThemeIcon {...props} color="red">
        <IconTrash size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  if (type.endsWith('.created') || type.endsWith('.uploaded')) {
    return (
      <ThemeIcon {...props} color="green">
        <IconPlus size={20} stroke={1.5} />
      </ThemeIcon>
    );
  }
  return (
    <ThemeIcon {...props} color="gray">
      <IconPencil size={20} stroke={1.5} />
    </ThemeIcon>
  );
}

export const BoardActivityEntryRow = memo(function BoardActivityEntryRow({
  row,
  boardLabel,
}: {
  readonly row: ParsedBoardActivityRow;
  readonly boardLabel?: string;
}) {
  return (
    <Box className="board-day-log__entry">
      <Group align="flex-start" gap="md" wrap="nowrap">
        <EntryIcon type={row.type} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          {boardLabel != null && boardLabel.trim() !== '' ? (
            <Text size="xs" c="dimmed" fw={600} truncate="end">
              {boardLabel}
            </Text>
          ) : null}
          <EntryBody row={row} />
          <Text size="xs" c="dimmed">
            {format(row.createdAt, 'MMM d, yyyy, h:mm a')}
          </Text>
        </Stack>
      </Group>
    </Box>
  );
});
