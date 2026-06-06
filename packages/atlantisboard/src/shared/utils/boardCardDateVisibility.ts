/**
 * Board-level visibility for card date sections (Kanban + card detail).
 * `showDueDateAndReminders` is legacy (bundled due + reminders); `showDueDateOnCards` overrides due when present.
 * `showRemindersOnCards` overrides reminders when present; client Dexie may expose resolved `showReminders` only.
 */
export interface BoardCardDateVisibilityInput {
  readonly showDueDateAndReminders?: boolean;
  readonly showRemindersOnCards?: boolean;
  /** Set by client `transformBoard` after resolving from API + legacy. */
  readonly showReminders?: boolean;
  readonly showStartDateOnCards?: boolean;
  readonly showDueDateOnCards?: boolean;
  readonly showEndDateOnCards?: boolean;
}

export function boardShowsStartDateOnCards(settings: BoardCardDateVisibilityInput | undefined): boolean {
  return settings?.showStartDateOnCards !== false;
}

export function boardShowsDueDateOnCards(settings: BoardCardDateVisibilityInput | undefined): boolean {
  if (settings?.showDueDateOnCards === false) {
    return false;
  }
  if (settings?.showDueDateOnCards === true) {
    return true;
  }
  return settings?.showDueDateAndReminders !== false;
}

export function boardShowsEndDateOnCards(settings: BoardCardDateVisibilityInput | undefined): boolean {
  return settings?.showEndDateOnCards !== false;
}

export function boardShowsRemindersOnCards(settings: BoardCardDateVisibilityInput | undefined): boolean {
  if (settings?.showReminders !== undefined) {
    return settings.showReminders !== false;
  }
  if (settings?.showRemindersOnCards === false) {
    return false;
  }
  if (settings?.showRemindersOnCards === true) {
    return true;
  }
  return settings?.showDueDateAndReminders !== false;
}
