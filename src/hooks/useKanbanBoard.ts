import { useState, useCallback } from 'react';
import { Board, Card, Column, Label } from '@/types/kanban';
import { DropResult } from '@hello-pangea/dnd';

const generateId = () => Math.random().toString(36).substr(2, 9);

const initialBoard: Board = {
  id: 'board-1',
  title: 'Project Board',
  columns: [
    {
      id: 'col-1',
      title: 'Backlog',
      cards: [
        {
          id: 'card-1',
          title: 'Research competitor features',
          description: 'Analyze top 5 competitors and document their key features',
          labels: [{ id: 'l1', color: 'blue', text: 'Research' }],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'card-2',
          title: 'Design system setup',
          description: 'Create color palette, typography, and component library',
          labels: [{ id: 'l2', color: 'purple', text: 'Design' }],
          createdAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: 'col-2',
      title: 'To Do',
      cards: [
        {
          id: 'card-3',
          title: 'Implement drag and drop',
          description: 'Add smooth drag and drop functionality for cards and columns',
          labels: [{ id: 'l3', color: 'green', text: 'Feature' }],
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: 'col-3',
      title: 'In Progress',
      cards: [
        {
          id: 'card-4',
          title: 'Build card component',
          description: 'Create reusable card component with labels and due dates',
          labels: [
            { id: 'l4', color: 'green', text: 'Feature' },
            { id: 'l5', color: 'orange', text: 'Priority' },
          ],
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: 'col-4',
      title: 'Done',
      cards: [
        {
          id: 'card-5',
          title: 'Project setup',
          description: 'Initialize project with React, TypeScript, and Tailwind',
          labels: [{ id: 'l6', color: 'green', text: 'Feature' }],
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

export function useKanbanBoard() {
  const [board, setBoard] = useState<Board>(initialBoard);

  const onDragEnd = useCallback((result: DropResult) => {
    const { destination, source, type } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    if (type === 'column') {
      setBoard((prev) => {
        const newColumns = Array.from(prev.columns);
        const [removed] = newColumns.splice(source.index, 1);
        newColumns.splice(destination.index, 0, removed);
        return { ...prev, columns: newColumns };
      });
      return;
    }

    setBoard((prev) => {
      const sourceColumn = prev.columns.find((col) => col.id === source.droppableId);
      const destColumn = prev.columns.find((col) => col.id === destination.droppableId);

      if (!sourceColumn || !destColumn) return prev;

      if (source.droppableId === destination.droppableId) {
        const newCards = Array.from(sourceColumn.cards);
        const [removed] = newCards.splice(source.index, 1);
        newCards.splice(destination.index, 0, removed);

        return {
          ...prev,
          columns: prev.columns.map((col) =>
            col.id === sourceColumn.id ? { ...col, cards: newCards } : col
          ),
        };
      }

      const sourceCards = Array.from(sourceColumn.cards);
      const [removed] = sourceCards.splice(source.index, 1);
      const destCards = Array.from(destColumn.cards);
      destCards.splice(destination.index, 0, removed);

      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === sourceColumn.id) return { ...col, cards: sourceCards };
          if (col.id === destColumn.id) return { ...col, cards: destCards };
          return col;
        }),
      };
    });
  }, []);

  const addColumn = useCallback((title: string) => {
    const newColumn: Column = {
      id: generateId(),
      title,
      cards: [],
    };
    setBoard((prev) => ({ ...prev, columns: [...prev.columns, newColumn] }));
  }, []);

  const updateColumn = useCallback((columnId: string, title: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId ? { ...col, title } : col
      ),
    }));
  }, []);

  const deleteColumn = useCallback((columnId: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.filter((col) => col.id !== columnId),
    }));
  }, []);

  const addCard = useCallback((columnId: string, title: string) => {
    const newCard: Card = {
      id: generateId(),
      title,
      labels: [],
      createdAt: new Date().toISOString(),
    };
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col
      ),
    }));
  }, []);

  const updateCard = useCallback((columnId: string, cardId: string, updates: Partial<Card>) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId ? { ...card, ...updates } : card
              ),
            }
          : col
      ),
    }));
  }, []);

  const deleteCard = useCallback((columnId: string, cardId: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter((card) => card.id !== cardId) }
          : col
      ),
    }));
  }, []);

  const addLabel = useCallback((columnId: string, cardId: string, label: Label) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId
                  ? { ...card, labels: [...card.labels, label] }
                  : card
              ),
            }
          : col
      ),
    }));
  }, []);

  const removeLabel = useCallback((columnId: string, cardId: string, labelId: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId
                  ? { ...card, labels: card.labels.filter((l) => l.id !== labelId) }
                  : card
              ),
            }
          : col
      ),
    }));
  }, []);

  return {
    board,
    onDragEnd,
    addColumn,
    updateColumn,
    deleteColumn,
    addCard,
    updateCard,
    deleteCard,
    addLabel,
    removeLabel,
  };
}
