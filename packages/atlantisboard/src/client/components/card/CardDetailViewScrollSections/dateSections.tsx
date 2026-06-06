import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar, IconX } from '@tabler/icons-react';
import { cardDetailSectionTitleProps, cardDetailSoftButtonStyles } from '../cardDetailSectionUi.js';

export function LazyMountWhenVisible({
  children,
  minHeight = 140,
}: {
  readonly children: ReactNode;
  readonly minHeight?: number;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el == null) {
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
        }
      },
      { root: null, rootMargin: '160px', threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, []);
  return (
    <Box ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? children : <Skeleton height={minHeight} radius="md" />}
    </Box>
  );
}

function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

function parseDatetimeLocalValue(raw: string): Date | null {
  if (raw.trim() === '') {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCardDateTime(value: Date): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface CardDateTimeSectionProps {
  readonly title: string;
  readonly titleIcon: ReactNode;
  readonly value: Date | undefined;
  readonly loading: boolean;
  readonly canEdit: boolean;
  readonly localValue: string;
  readonly setLocalValue: (value: string) => void;
  readonly pickerOpened: boolean;
  readonly setPickerOpened: (opened: boolean) => void;
  readonly onSave: () => void | Promise<void>;
  readonly onClear: () => Promise<void>;
  readonly setButtonLabel: string;
  readonly emptyReadonlyLabel: string;
  readonly modalTitle: string;
  readonly timeInputAriaLabel: string;
  readonly clearAriaLabel: string;
}

export function CardDateTimeSection({
  title,
  titleIcon,
  value,
  loading,
  canEdit,
  localValue,
  setLocalValue,
  pickerOpened,
  setPickerOpened,
  onSave,
  onClear,
  setButtonLabel,
  emptyReadonlyLabel,
  modalTitle,
  timeInputAriaLabel,
  clearAriaLabel,
}: CardDateTimeSectionProps): ReactElement {
  const draft = parseDatetimeLocalValue(localValue);
  const timeValue = draft
    ? `${String(draft.getHours()).padStart(2, '0')}:${String(draft.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <Box>
      <Group gap="xs" wrap="nowrap" mb="xs">
        {titleIcon}
        <Text {...cardDetailSectionTitleProps}>{title}</Text>
      </Group>
      <Stack gap="xs" align="flex-start">
        <Group gap="xs" align="center" wrap="wrap">
          {canEdit ? (
            <Button
              size="sm"
              variant="default"
              leftSection={<IconCalendar size={16} />}
              styles={cardDetailSoftButtonStyles}
              onClick={() => setPickerOpened(true)}
              disabled={loading}
            >
              {value ? formatCardDateTime(value) : setButtonLabel}
            </Button>
          ) : (
            <Text size="sm" c="dimmed">
              {value ? formatCardDateTime(value) : emptyReadonlyLabel}
            </Text>
          )}
          {value && canEdit ? (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label={clearAriaLabel}
              onClick={() => {
                void onClear();
              }}
              disabled={loading}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : null}
        </Group>
        <Modal
          opened={pickerOpened}
          onClose={() => setPickerOpened(false)}
          title={modalTitle}
          centered
          withinPortal
          size="sm"
          transitionProps={{ duration: 0 }}
        >
          <Stack gap="sm">
            <Text size="sm" fw={500}>
              {modalTitle}
            </Text>
            <TextInput
              label="Date"
              value={
                draft
                  ? draft.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })
                  : ''
              }
              readOnly
            />
            <TextInput
              label="Time"
              type="time"
              value={timeValue}
              onChange={(e) => {
                const next = e.currentTarget.value;
                if (next.trim() === '') {
                  return;
                }
                const [h, m] = next.split(':');
                if (h == null || m == null) {
                  return;
                }
                const base = draft ?? new Date();
                base.setHours(Number(h), Number(m), 0, 0);
                setLocalValue(toDatetimeLocalValue(base));
              }}
              aria-label={timeInputAriaLabel}
              disabled={!canEdit}
            />
            <DatePicker
              value={draft}
              onChange={(date: unknown) => {
                if (!canEdit) {
                  return;
                }
                if (date == null) {
                  return;
                }
                const picked = date instanceof Date ? date : new Date(String(date));
                if (Number.isNaN(picked.getTime())) {
                  return;
                }
                const base = draft ?? new Date();
                base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                setLocalValue(toDatetimeLocalValue(base));
              }}
              size="sm"
              style={{ width: '100%' }}
              styles={{
                calendarHeader: { width: '100%' },
                month: { width: '100%' },
              }}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="default"
                styles={cardDetailSoftButtonStyles}
                onClick={() => setPickerOpened(false)}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                variant="default"
                styles={cardDetailSoftButtonStyles}
                onClick={() => void onSave()}
                loading={loading}
                disabled={!canEdit}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Box>
  );
}
