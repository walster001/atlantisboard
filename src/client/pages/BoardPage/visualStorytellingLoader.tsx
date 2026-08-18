import { lazy } from 'react';
import { Box, Loader } from '@mantine/core';

export const VisualStorytellingView = lazy(async () => {
  const m = await import('../../components/board/visualStorytelling/VisualStorytellingView.js');
  return { default: m.VisualStorytellingView };
});

export const VS_VIEW_SUSPENSE_FALLBACK = (
  <Box className="flex items-center justify-center" style={{ minHeight: 280 }}>
    <Loader size="md" />
  </Box>
);
