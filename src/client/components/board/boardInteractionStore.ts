import { create } from 'zustand';

export interface CardMenuTarget {
  readonly listId: string;
  readonly cardId: string;
  readonly anchorRect: DOMRect;
}

interface BoardInteractionState {
  readonly cardMenuTarget: CardMenuTarget | null;
  openCardMenu: (target: CardMenuTarget) => void;
  closeCardMenu: () => void;
}

export const useBoardInteractionStore = create<BoardInteractionState>((set) => ({
  cardMenuTarget: null,
  openCardMenu: (target) => set({ cardMenuTarget: target }),
  closeCardMenu: () => set({ cardMenuTarget: null }),
}));
