import { notifications } from '@mantine/notifications';
import { api } from '../../../utils/api.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import type { ClearDateFieldArgs, SaveDateFieldArgs } from './cardDetailViewHandlerTypes.js';

export async function runSaveDateField({
  card,
  kind,
  value,
  close,
  label,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
}: SaveDateFieldArgs): Promise<void> {
  if (!value.trim()) {
    notifications.show({ color: 'yellow', title: label, message: 'Choose a date and time.' });
    return;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    notifications.show({ color: 'red', title: 'Invalid date', message: 'Could not read that date.' });
    return;
  }
  const response = await api.updateCard(card.id, { [kind]: parsed.toISOString() });
  try {
    syncCardToBoardAndDexie(normalizeCardFromApi(response.card, card.id));
  } catch {
    notifyNormalizeFailure();
  }
  close();
}

export async function runClearDateField({
  card,
  kind,
  close,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
}: ClearDateFieldArgs): Promise<void> {
  const response = await api.updateCard(card.id, { [kind]: null });
  try {
    syncCardToBoardAndDexie(normalizeCardFromApi(response.card, card.id));
  } catch {
    notifyNormalizeFailure();
  }
  close();
}

export function notifyCardUpdateNormalizeFailure(): void {
  notifications.show({
    color: 'red',
    title: 'Update failed',
    message: 'Could not read updated card from server.',
  });
}
