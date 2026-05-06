import { memo, type ComponentProps } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CardDB } from '../../../store/database.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import { SortableList } from '../SortableList.js';
import type { CardDropIndicatorTarget } from '../VirtualizedCardList.js';

export const KANBAN_ADD_LIST_BUTTON_STYLES = {
  inner: {
    padding: '11px 16px 11px 14px',
  },
  section: {
    marginInlineEnd: 6,
  },
} as const;

export interface ListDropIndicatorTarget {
  readonly overListId: string;
}

export const LIST_HORIZONTAL_GAP_PX = 12;
export const LIST_WINDOW_OVERSCAN_COLUMNS = 2;

/** Layout intent only — boxWidth/boxHeight are display hints and must not trigger re-renders every tick. */
export function cardDropIndicatorsEqual(
  a: CardDropIndicatorTarget | null,
  b: CardDropIndicatorTarget | null
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return (
    a.listId === b.listId &&
    a.sourceListId === b.sourceListId &&
    a.anchorCardId === b.anchorCardId &&
    a.columnIntent === b.columnIntent
  );
}

export function listDropIndicatorsEqual(
  a: ListDropIndicatorTarget | null,
  b: ListDropIndicatorTarget | null
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  return a.overListId === b.overListId;
}

/** One column: subscribes only to that list's cards so remote card updates don't re-render every list. */
type KanbanListColumnProps = Omit<ComponentProps<typeof SortableList>, 'cards'>;

export const KanbanListColumn = memo(function KanbanListColumn(props: KanbanListColumnProps) {
  const listId = props.list.id;
  const cards = useBoardRuntimeStore(
    useShallow((s) => {
      const ids = s.cardIdsByListId[listId] ?? [];
      const out: CardDB[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]!;
        const c = s.cardsById[id];
        if (c != null) {
          out.push(c);
        }
      }
      return out;
    })
  );
  return <SortableList {...props} cards={cards} />;
});
