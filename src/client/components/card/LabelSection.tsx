import { useState, useEffect, useRef, useMemo } from 'react';
import { Stack, Text, Button, Badge, Checkbox, Popover, Group, Box, ActionIcon } from '@mantine/core';
import { IconTag, IconX } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { extractMongoStringId, normalizeCardFromApi } from '../../utils/transform.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import { subscribeSocketBoardLabelsChanged } from '../../utils/socketRealtimeBridge.js';

interface Label {
  id: string;
  name: string;
  color: string;
  isPredefined?: boolean;
}

/** API returns `_id`; normalize so toggles use real ObjectIds, not `undefined` in URLs. */
function normalizeBoardLabelList(
  raw: ReadonlyArray<{ id?: unknown; _id?: unknown; name: string; color: string; isPredefined?: boolean }>,
): Label[] {
  return raw
    .map((l): Label => {
      const id = extractMongoStringId(l.id) || extractMongoStringId(l._id);
      const out: Label = { id, name: l.name, color: l.color };
      if (l.isPredefined !== undefined) {
        out.isPredefined = l.isPredefined;
      }
      return out;
    })
    .filter((l) => l.id.length > 0);
}

interface LabelSectionProps {
  card: CardDB;
  boardId: string;
  onCardUpdate: (card: CardDB) => void;
}

interface LabelPending {
  readonly adds: Set<string>;
  readonly removes: Set<string>;
}

function emptyLabelPending(): LabelPending {
  return { adds: new Set(), removes: new Set() };
}

function isLabelEffective(labelId: string, cardLabels: readonly { id: string }[], pending: LabelPending): boolean {
  if (pending.removes.has(labelId)) {
    return false;
  }
  if (pending.adds.has(labelId)) {
    return true;
  }
  return cardLabels.some((l) => l.id === labelId);
}

function flipLabelPending(
  prev: LabelPending,
  labelId: string,
  cardLabels: readonly { id: string }[],
): LabelPending {
  const adds = new Set(prev.adds);
  const removes = new Set(prev.removes);
  const effective = isLabelEffective(labelId, cardLabels, prev);
  if (effective) {
    removes.add(labelId);
    adds.delete(labelId);
  } else {
    adds.add(labelId);
    removes.delete(labelId);
  }
  return { adds, removes };
}

export function LabelSection({ card, boardId, onCardUpdate }: LabelSectionProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [labelPending, setLabelPending] = useState<LabelPending>(() => emptyLabelPending());
  const labelToggleInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadLabels = async () => {
      try {
        const response = await api.getBoardLabels(boardId);
        const boardLabels = (
          response as {
            labels: ReadonlyArray<{
              id?: unknown;
              _id?: unknown;
              name: string;
              color: string;
              isPredefined?: boolean;
            }>;
          }
        ).labels;
        setLabels(normalizeBoardLabelList(boardLabels));
      } catch (error) {
        console.error('Error loading labels:', error);
      }
    };

    loadLabels();
  }, [boardId]);

  useEffect(() => {
    return subscribeSocketBoardLabelsChanged(({ boardId: changedId }) => {
      if (changedId !== boardId) {
        return;
      }
      void (async () => {
        try {
          const response = await api.getBoardLabels(boardId);
          const boardLabels = (
            response as {
              labels: ReadonlyArray<{
                id?: unknown;
                _id?: unknown;
                name: string;
                color: string;
                isPredefined?: boolean;
              }>;
            }
          ).labels;
          setLabels(normalizeBoardLabelList(boardLabels));
        } catch (error) {
          console.error('Error loading labels:', error);
        }
      })();
    });
  }, [boardId]);

  const labelIdsMembershipKey = useMemo(
    () =>
      [...card.labels]
        .map((l) => l.id)
        .sort((a, b) => a.localeCompare(b))
        .join('\0'),
    [card.labels],
  );

  useEffect(() => {
    setLabelPending((prev) => {
      let changed = false;
      const adds = new Set(prev.adds);
      const removes = new Set(prev.removes);
      for (const id of prev.adds) {
        if (card.labels.some((l) => l.id === id)) {
          adds.delete(id);
          changed = true;
        }
      }
      for (const id of prev.removes) {
        if (!card.labels.some((l) => l.id === id)) {
          removes.delete(id);
          changed = true;
        }
      }
      if (!changed) {
        return prev;
      }
      return { adds, removes };
    });
  }, [labelIdsMembershipKey]);

  const cardLabelsContentKey = useMemo(
    () =>
      [...card.labels]
        .map((l) => `${l.id}\t${l.name}\t${l.color}`)
        .sort((a, b) => a.localeCompare(b))
        .join('\n'),
    [card.labels],
  );

  const displayCardLabels = useMemo((): CardDB['labels'] => {
    const list: CardDB['labels'] = card.labels.filter((l) => !labelPending.removes.has(l.id));
    const ids = new Set(list.map((l) => l.id));
    for (const id of labelPending.adds) {
      if (ids.has(id)) {
        continue;
      }
      const meta = labels.find((x) => x.id === id);
      if (meta !== undefined) {
        list.push({ id: meta.id, name: meta.name, color: meta.color });
        ids.add(id);
      }
    }
    return list;
  }, [cardLabelsContentKey, labelPending, labels]);

  const handleToggleLabel = async (labelId: string) => {
    if (labelToggleInFlightRef.current.has(labelId)) {
      return;
    }
    labelToggleInFlightRef.current.add(labelId);
    const wasAssigned = card.labels.some((l) => l.id === labelId);
    setLabelPending((prev) => flipLabelPending(prev, labelId, card.labels));

    try {
      if (wasAssigned) {
        await api.removeLabelFromCard(card.id, labelId);
      } else {
        await api.assignLabelToCard(card.id, labelId);
      }

      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
      onCardUpdate(updatedCard);
    } catch (error) {
      console.error('Error toggling label:', error);
      setLabelPending(emptyLabelPending());
    } finally {
      labelToggleInFlightRef.current.delete(labelId);
    }
  };

  return (
    <Stack gap="xs" align="flex-start">
      <Group gap="xs" wrap="nowrap">
        <IconTag size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
        <Text {...cardDetailSectionTitleProps}>Labels</Text>
      </Group>
      <Popover
        opened={showLabelPicker}
        onChange={setShowLabelPicker}
        position="bottom-start"
        width={200}
        zIndex={520}
      >
        <Popover.Target>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconTag size={16} />}
            styles={cardDetailSoftButtonStyles}
            onClick={() => setShowLabelPicker(!showLabelPicker)}
          >
            Add Label
          </Button>
        </Popover.Target>

          <Popover.Dropdown>
            <Stack gap="xs">
              <Text fw={600}>Labels</Text>
              <Box style={{ maxHeight: '256px', overflowY: 'auto' }}>
                <Stack gap="xs">
                  {labels.map((label) => {
                    const isAssigned = isLabelEffective(label.id, card.labels, labelPending);
                    return (
                      <Group
                        key={label.id}
                        gap="xs"
                        p="xs"
                        style={{
                          cursor: 'pointer',
                          borderRadius: 'var(--mantine-radius-sm)',
                        }}
                        onClick={() => handleToggleLabel(label.id)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Checkbox
                          size="sm"
                          checked={isAssigned}
                          onChange={() => {}}
                        />
                        <Badge
                          style={{
                            backgroundColor: label.color,
                            flex: 1,
                            textTransform: 'uppercase',
                            fontFamily: 'var(--kb-app-ui-font-family)',
                            fontWeight: 400,
                          }}
                        >
                          {label.name.toUpperCase()}
                        </Badge>
                      </Group>
                    );
                  })}
                  {labels.length === 0 && (
                    <Text size="sm" c="dimmed" p="xs">
                      No labels available. Create labels in board settings.
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Popover.Dropdown>
      </Popover>

      {displayCardLabels.length > 0 && (
        <Group
          gap="xs"
          mb="xs"
          wrap="wrap"
          style={{ alignSelf: 'stretch', width: '100%' }}
        >
          {displayCardLabels.map((label) => (
            <Box
              key={label.id}
              style={{
                backgroundColor: label.color,
                color: 'var(--mantine-color-white)',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 12,
                paddingRight: 6,
                paddingTop: 4,
                paddingBottom: 4,
                maxWidth: '100%',
              }}
            >
              <Text
                size="sm"
                fw={400}
                style={{
                  color: 'inherit',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--kb-app-ui-font-family)',
                }}
              >
                {label.name.toUpperCase()}
              </Text>
              <ActionIcon
                size="xs"
                variant="transparent"
                color="gray"
                aria-label={`Remove label ${label.name}`}
                onClick={() => handleToggleLabel(label.id)}
                styles={{
                  root: {
                    color: 'inherit',
                    opacity: 0.9,
                    '&:hover': { opacity: 1, backgroundColor: 'rgba(255, 255, 255, 0.18)' },
                  },
                }}
              >
                <IconX size={11} stroke={2.5} />
              </ActionIcon>
            </Box>
          ))}
        </Group>
      )}
    </Stack>
  );
}

