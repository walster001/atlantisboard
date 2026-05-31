export const CHECKLIST_TITLE_MAX_LENGTH = 100;
export const CHECKLIST_ITEM_TEXT_MAX_LENGTH = 500;

export function findChecklistItemCompleted(
  card: { readonly checklists: ReadonlyArray<{ readonly items: ReadonlyArray<{ readonly id: string; readonly completed: boolean }> }> },
  itemId: string,
): boolean | undefined {
  for (const cl of card.checklists) {
    for (const it of cl.items) {
      if (it.id === itemId) {
        return it.completed;
      }
    }
  }
  return undefined;
}
