import { lazy } from 'react';
import { Box, Loader } from '@mantine/core';

export const KanbanView = lazy(async () => {
  const m = await import('../../components/board/KanbanView.js');
  return { default: m.KanbanView };
});

export const KANBAN_VIEW_SUSPENSE_FALLBACK = (
  <Box className="flex items-center justify-center" style={{ minHeight: 280 }}>
    <Loader size="md" />
  </Box>
);
