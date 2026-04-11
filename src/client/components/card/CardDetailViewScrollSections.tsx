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
import { IconCalendar, IconClock, IconX } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { AttachmentSection } from './AttachmentSection.js';
import { AssigneeSection } from './AssigneeSection.js';
import { ChecklistSection } from './ChecklistSection.js';
import { CommentSection } from './CommentSection.js';
import { LabelSection } from './LabelSection.js';
import { ReminderSection } from './ReminderSection.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import '@mantine/dates/styles.css';

function LazyMountWhenVisible({
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

export interface CardDetailViewScrollSectionsProps {
  readonly card: CardDB;
  readonly boardId: string;
  readonly loading: boolean;
  readonly showDueDateAndReminders: boolean;
  readonly showLabels: boolean;
  readonly showAssignees: boolean;
  readonly showChecklist: boolean;
  readonly showAttachments: boolean;
  readonly showComments: boolean;
  readonly canCreateComments: boolean;
  readonly canDeleteOthersComments: boolean;
  readonly dueLocal: string;
  readonly setDueLocal: (value: string) => void;
  readonly duePickerOpened: boolean;
  readonly setDuePickerOpened: (opened: boolean) => void;
  readonly syncCardToBoardAndDexie: (next: CardDB) => void;
  readonly onSaveDueDate: () => void | Promise<void>;
  readonly onClearDueDate: () => Promise<void>;
  readonly onBeforeDeleteAttachment?: (attachmentId: string) => Promise<void>;
}

export function CardDetailViewScrollSections({
  card,
  boardId,
  loading,
  showDueDateAndReminders,
  showLabels,
  showAssignees,
  showChecklist,
  showAttachments,
  showComments,
  canCreateComments,
  canDeleteOthersComments,
  dueLocal,
  setDueLocal,
  duePickerOpened,
  setDuePickerOpened,
  syncCardToBoardAndDexie,
  onSaveDueDate,
  onClearDueDate,
  onBeforeDeleteAttachment,
}: CardDetailViewScrollSectionsProps) {
  return (
    <>
      {showDueDateAndReminders ? (
        <Box>
          <Group gap="xs" wrap="nowrap" mb="xs">
            <IconClock size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
            <Text {...cardDetailSectionTitleProps}>Due date</Text>
          </Group>
          <Stack gap="xs" align="flex-start">
            {(() => {
              const dueDraft = parseDatetimeLocalValue(dueLocal);
              const dueTimeValue = dueDraft
                ? `${String(dueDraft.getHours()).padStart(2, '0')}:${String(dueDraft.getMinutes()).padStart(
                    2,
                    '0',
                  )}`
                : '';
              return (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    leftSection={<IconCalendar size={16} />}
                    styles={{
                      root: {
                        backgroundColor: '#f0f1f4',
                        border: 'none',
                        color: 'var(--mantine-color-dark-7)',
                        borderRadius: 8,
                        paddingInline: 'var(--mantine-spacing-md)',
                        fontWeight: 500,
                        boxShadow: 'none',
                        width: 'fit-content',
                        maxWidth: '100%',
                        '&:hover': {
                          backgroundColor: '#e4e6ea',
                          color: 'var(--mantine-color-dark-7)',
                        },
                        '&:disabled': {
                          backgroundColor: '#f0f1f4',
                          opacity: 0.55,
                        },
                      },
                      label: { color: 'var(--mantine-color-dark-7)' },
                      section: { color: 'var(--mantine-color-dark-7)', pointerEvents: 'auto' },
                    }}
                    onClick={() => setDuePickerOpened(true)}
                    disabled={loading}
                    rightSection={
                      card.dueDate ? (
                        <ActionIcon
                          size="xs"
                          variant="transparent"
                          color="gray"
                          aria-label="Clear due date"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onClearDueDate();
                          }}
                          styles={{
                            root: {
                              color: 'var(--mantine-color-gray-7)',
                              '&:hover': {
                                backgroundColor: 'var(--mantine-color-gray-2)',
                              },
                            },
                          }}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      ) : null
                    }
                  >
                    {card.dueDate
                      ? new Date(card.dueDate).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Set due date'}
                  </Button>
                  <Modal
                    opened={duePickerOpened}
                    onClose={() => setDuePickerOpened(false)}
                    title="Due date & time"
                    centered
                    size="sm"
                    transitionProps={{ duration: 0 }}
                  >
                    <Stack gap="sm">
                      <Text size="sm" fw={500}>
                        Due date & time
                      </Text>
                      <TextInput
                        label="Date"
                        value={
                          dueDraft
                            ? dueDraft.toLocaleDateString(undefined, {
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
                        value={dueTimeValue}
                        onChange={(e) => {
                          const next = e.currentTarget.value;
                          if (next.trim() === '') {
                            return;
                          }
                          const [h, m] = next.split(':');
                          if (h == null || m == null) {
                            return;
                          }
                          const base = dueDraft ?? new Date();
                          base.setHours(Number(h), Number(m), 0, 0);
                          setDueLocal(toDatetimeLocalValue(base));
                        }}
                        aria-label="Due time"
                      />
                      <DatePicker
                        value={dueDraft}
                        onChange={(date: unknown) => {
                          if (date == null) {
                            return;
                          }
                          const picked = date instanceof Date ? date : new Date(String(date));
                          if (Number.isNaN(picked.getTime())) {
                            return;
                          }
                          const base = dueDraft ?? new Date();
                          base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                          setDueLocal(toDatetimeLocalValue(base));
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
                          onClick={() => setDuePickerOpened(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          styles={cardDetailSoftButtonStyles}
                          onClick={() => void onSaveDueDate()}
                          loading={loading}
                        >
                          Save
                        </Button>
                      </Group>
                    </Stack>
                  </Modal>
                </>
              );
            })()}
          </Stack>
          <Box mt="md">
            <ReminderSection
              card={card}
              onCardUpdate={(updatedCard) => {
                syncCardToBoardAndDexie(updatedCard);
              }}
            />
          </Box>
        </Box>
      ) : null}

      {showLabels ? (
        <LabelSection
          card={card}
          boardId={boardId}
          onCardUpdate={(updatedCard) => {
            syncCardToBoardAndDexie(updatedCard);
          }}
        />
      ) : null}

      {showAssignees ? (
        <AssigneeSection
          card={card}
          boardId={boardId}
          onCardUpdate={(updatedCard) => {
            syncCardToBoardAndDexie(updatedCard);
          }}
        />
      ) : null}

      {showChecklist ? (
        <LazyMountWhenVisible minHeight={160}>
          <ChecklistSection
            card={card}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}

      {showAttachments ? (
        <LazyMountWhenVisible minHeight={180}>
          <AttachmentSection
            card={card}
            {...(onBeforeDeleteAttachment != null
              ? { onBeforeDeleteAttachment }
              : {})}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}

      {showComments ? (
        <LazyMountWhenVisible minHeight={200}>
          <CommentSection
            card={card}
            boardId={boardId}
            canCreateComments={canCreateComments}
            canDeleteOthersComments={canDeleteOthersComments}
            onCardUpdate={(updatedCard) => {
              syncCardToBoardAndDexie(updatedCard);
            }}
          />
        </LazyMountWhenVisible>
      ) : null}
    </>
  );
}
