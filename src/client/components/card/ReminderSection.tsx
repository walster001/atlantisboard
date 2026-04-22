import { useState } from 'react';
import { Stack, Text, Button, Group, Box } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import { formatDistanceToNow, format } from 'date-fns';
import { ReminderModal } from './ReminderModal.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailMutedLineProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';

interface Reminder {
  id: string;
  triggerAt: Date;
  repeatFrequency?: string;
  sent: boolean;
  sentAt?: Date;
  dismissed: boolean;
}

interface ReminderSectionProps {
  card: CardDB;
  onCardUpdate: (card: CardDB) => void;
}

export function ReminderSection({ card, onCardUpdate }: ReminderSectionProps) {
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(false);

  const activeReminders = (card.reminders || []).filter((r) => !r.dismissed);

  const handleDelete = (reminderId: string) => {
    modals.openConfirmModal({
      title: 'Delete reminder',
      children: <Text size="sm">Delete this reminder?</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setLoading(true);
        try {
          await api.deleteCardReminder(card.id, reminderId);
          const response = await api.getCard(card.id);
          const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
          onCardUpdate(updatedCard);
        } catch (error) {
          console.error('Error deleting reminder:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete reminder',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleDismiss = async (reminderId: string) => {
    setLoading(true);
    try {
      await api.dismissCardReminder(card.id, reminderId);
      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
      onCardUpdate(updatedCard);
    } catch (error) {
      console.error('Error dismissing reminder:', error);
      notifications.show({
        color: 'red',
        title: 'Could not dismiss reminder',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setShowReminderModal(true);
  };

  const handleCreate = () => {
    if (!card.dueDate) {
      notifications.show({
        color: 'yellow',
        title: 'Due date required',
        message: 'Card must have a due date to add reminders.',
      });
      return;
    }
    if (activeReminders.length >= 3) {
      notifications.show({
        color: 'yellow',
        title: 'Reminder limit',
        message: 'Maximum of 3 reminders per card.',
      });
      return;
    }
    setEditingReminder(null);
    setShowReminderModal(true);
  };

  const handleReminderSaved = async () => {
    const response = await api.getCard(card.id);
    const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
    onCardUpdate(updatedCard);
    setShowReminderModal(false);
    setEditingReminder(null);
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconBell size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          <Text {...cardDetailSectionTitleProps}>Reminders</Text>
        </Group>
        {card.dueDate && activeReminders.length < 3 && (
          <Button
            size="sm"
            variant="default"
            styles={cardDetailSoftButtonStyles}
            onClick={handleCreate}
            disabled={loading}
          >
            Add Reminder
          </Button>
        )}
      </Group>

      {!card.dueDate && (
        <Text {...cardDetailEmptyStateProps}>
          Set a due date above to add reminders.
        </Text>
      )}

      {activeReminders.length === 0 && card.dueDate && (
        <Text {...cardDetailMutedLineProps}>No reminders set.</Text>
      )}

      {activeReminders.length > 0 && (
        <Stack gap="xs">
          {activeReminders.map((reminder) => (
            <Group
              key={reminder.id}
              justify="space-between"
              align="center"
              p="xs"
              style={{
                backgroundColor: 'var(--mantine-color-gray-1)',
                borderRadius: 'var(--mantine-radius-md)',
              }}
            >
              <Box style={{ flex: 1 }}>
                <Text size="sm" fw={500}>
                  {format(new Date(reminder.triggerAt), 'PPp')}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDistanceToNow(new Date(reminder.triggerAt), { addSuffix: true })}
                  {reminder.repeatFrequency && ` • Repeats: ${reminder.repeatFrequency}`}
                  {reminder.sent && ' • Sent'}
                </Text>
              </Box>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => handleEdit(reminder as Reminder)}
                  disabled={loading}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => handleDismiss(reminder.id)}
                  disabled={loading}
                >
                  Dismiss
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleDelete(reminder.id)}
                  disabled={loading}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {showReminderModal && (
        <ReminderModal
          key={`${editingReminder?.id ?? 'new'}-${card.dueDate ?? ''}`}
          card={card}
          reminder={editingReminder}
          onClose={() => {
            setShowReminderModal(false);
            setEditingReminder(null);
          }}
          onSave={handleReminderSaved}
        />
      )}
    </Stack>
  );
}

