import { useParams } from 'react-router-dom';
import { Box, Title, Text, Stack } from '@mantine/core';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Box className="min-h-screen flex items-center justify-center">
      <Stack align="center" gap="md">
        <Title order={2}>Workspace {id}</Title>
        <Text>Workspace page - placeholder</Text>
      </Stack>
    </Box>
  );
}
