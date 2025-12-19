export type LabelColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface Label {
  id: string;
  color: LabelColor;
  text?: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  labels: Label[];
  dueDate?: string;
  createdAt: string;
  color?: string | null;
}

export interface Column {
  id: string;
  title: string;
  cards: Card[];
  color?: string | null;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
}
