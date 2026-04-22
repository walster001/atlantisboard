import { useState } from 'react';
import { Modal, NumberInput, Select, TextInput, Button, Alert, Stack, Group, Text } from '@mantine/core';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { addMinutes, addHours, addDays, addWeeks } from 'date-fns';

interface Reminder {
  id: string;
  triggerAt: Date;
  repeatFrequency?: string;
  sent: boolean;
  dismissed: boolean;
}

interface ReminderModalProps {
  card: CardDB;
  reminder?: Reminder | null;
  onClose: () => void;
  onSave: () => void;
}

function initialReminderFields(
  reminder: Reminder | null | undefined,
  cardDue: CardDB['dueDate'],
): {
  offsetType: 'minutes' | 'hours' | 'days' | 'weeks';
  offsetValue: number;
  repeatFrequency: string;
} {
  if (!reminder) {
    return { offsetType: 'days', offsetValue: 1, repeatFrequency: '' };
  }
  const dueDate = cardDue ? new Date(cardDue) : new Date();
  const triggerAt = new Date(reminder.triggerAt);
  const diffMs = triggerAt.getTime() - dueDate.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  let offsetType: 'minutes' | 'hours' | 'days' | 'weeks';
  let offsetValue: number;
  if (Math.abs(diffMinutes) < 60) {
    offsetType = 'minutes';
    offsetValue = Math.abs(diffMinutes);
  } else if (Math.abs(diffMinutes) < 24 * 60) {
    offsetType = 'hours';
    offsetValue = Math.abs(diffMinutes / 60);
  } else if (Math.abs(diffMinutes) < 7 * 24 * 60) {
    offsetType = 'days';
    offsetValue = Math.abs(diffMinutes / (24 * 60));
  } else {
    offsetType = 'weeks';
    offsetValue = Math.abs(diffMinutes / (7 * 24 * 60));
  }

  return {
    offsetType,
    offsetValue,
    repeatFrequency: reminder.repeatFrequency || '',
  };
}

export function ReminderModal({ card, reminder, onClose, onSave }: ReminderModalProps) {
  const initial = initialReminderFields(reminder ?? null, card.dueDate);
  const [offsetType, setOffsetType] = useState(initial.offsetType);
  const [offsetValue, setOffsetValue] = useState(initial.offsetValue);
  const [repeatFrequency, setRepeatFrequency] = useState(initial.repeatFrequency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateTriggerAt = (): Date => {
    if (!card.dueDate) {
      throw new Error('Card must have a due date');
    }

    const dueDate = new Date(card.dueDate);
    let triggerAt: Date;

    switch (offsetType) {
      case 'minutes':
        triggerAt = addMinutes(dueDate, -offsetValue);
        break;
      case 'hours':
        triggerAt = addHours(dueDate, -offsetValue);
        break;
      case 'days':
        triggerAt = addDays(dueDate, -offsetValue);
        break;
      case 'weeks':
        triggerAt = addWeeks(dueDate, -offsetValue);
        break;
      default:
        triggerAt = dueDate;
    }

    return triggerAt;
  };

  const validateRepeatFrequency = (frequency: string): boolean => {
    if (!frequency.trim()) {
      return true; // Empty is valid (no repeat)
    }
    // Validate format: number + unit (h, d, m, s)
    const match = frequency.match(/^(\d+)([hdms])$/i);
    return match !== null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!card.dueDate) {
        setError('Card must have a due date');
        return;
      }

      // Validate repeat frequency format
      if (repeatFrequency && !validateRepeatFrequency(repeatFrequency)) {
        setError('Invalid repeat frequency format. Use format like "1h", "2d", "30m"');
        setLoading(false);
        return;
      }

      const triggerAt = calculateTriggerAt();

      if (reminder) {
        // Update existing reminder
        const updateData: {
          triggerAt: string;
          repeatFrequency?: string;
        } = {
          triggerAt: triggerAt.toISOString(),
        };
        if (repeatFrequency) {
          updateData.repeatFrequency = repeatFrequency;
        }
        await api.updateCardReminder(card.id, reminder.id, updateData);
      } else {
        // Create new reminder
        const createData: {
          triggerAt: string;
          repeatFrequency?: string;
        } = {
          triggerAt: triggerAt.toISOString(),
        };
        if (repeatFrequency) {
          createData.repeatFrequency = repeatFrequency;
        }
        await api.addCardReminder(card.id, createData);
      }

      onSave();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save reminder');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={reminder ? 'Edit Reminder' : 'Add Reminder'}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && (
            <Alert color="red">
              {error}
            </Alert>
          )}

          {!card.dueDate && (
            <Alert color="yellow">
              Card must have a due date to add reminders
            </Alert>
          )}

          <Group align="flex-end" gap="xs">
            <NumberInput
              label="Remind me"
              value={offsetValue}
              onChange={(value) => setOffsetValue(typeof value === 'number' ? value : 0)}
              min={0}
              disabled={!card.dueDate || loading}
              style={{ width: '80px' }}
            />
            <Select
              value={offsetType}
              onChange={(value) => setOffsetType((value || 'days') as 'minutes' | 'hours' | 'days' | 'weeks')}
              data={[
                { value: 'minutes', label: 'minute(s) before' },
                { value: 'hours', label: 'hour(s) before' },
                { value: 'days', label: 'day(s) before' },
                { value: 'weeks', label: 'week(s) before' },
              ]}
              disabled={!card.dueDate || loading}
              style={{ flex: 1 }}
            />
            <Text size="sm" c="dimmed" mb="xs">due date</Text>
          </Group>

          <TextInput
            label="Repeat frequency (optional)"
            placeholder="e.g., 1h, 2d, 30m"
            value={repeatFrequency}
            onChange={(e) => setRepeatFrequency(e.currentTarget.value)}
            disabled={loading}
            error={repeatFrequency && !validateRepeatFrequency(repeatFrequency) ? 'Invalid format. Use format like "1h" (hours), "2d" (days), "30m" (minutes)' : undefined}
            description={repeatFrequency && !validateRepeatFrequency(repeatFrequency) ? undefined : 'Leave empty for one-time reminder. Format: number + unit (e.g., "1h", "2d", "30m")'}
          />

          {card.dueDate && (
            <Alert color="blue">
              Reminder will trigger on: {calculateTriggerAt().toLocaleString()}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              type="button"
              variant="subtle"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              disabled={!card.dueDate || loading}
              loading={loading}
            >
              {loading ? 'Saving...' : reminder ? 'Update' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
