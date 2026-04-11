import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, ActionIcon, Stack, Text, Title, Group, Grid } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import type { WorkspaceDB, BoardDB } from '../../store/database.js';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal.js';

interface WorkspaceCardProps {
  workspace: WorkspaceDB;
  boards: BoardDB[];
}

export function WorkspaceCard({ workspace, boards }: WorkspaceCardProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <Card shadow="sm" padding="md" radius="md" style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div style={{ flex: 1 }}>
              <Title order={3}>{workspace.name}</Title>
              {workspace.description && (
                <Text size="sm" c="dimmed" mt="xs">{workspace.description}</Text>
              )}
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setShowSettings(true)}
              title="Workspace Settings"
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Group>
          <Group justify="flex-end">
            <Button
              component={Link}
              to={`/workspace/${workspace.id}`}
              size="sm"
              color="blue"
            >
              View Workspace
            </Button>
          </Group>
          {boards.length > 0 && (
            <Stack gap="xs" mt="md">
              <Text size="sm" fw={600}>Boards ({boards.length})</Text>
              <Grid gutter="xs">
                {boards.map((board) => (
                  <Grid.Col key={board.id} span={12}>
                    <Button
                      component={Link}
                      to={`/boards/${board.id}`}
                      variant="outline"
                      size="sm"
                      fullWidth
                      justify="flex-start"
                    >
                      {board.name}
                    </Button>
                  </Grid.Col>
                ))}
              </Grid>
            </Stack>
          )}
        </Stack>
      </Card>

      {showSettings && (
        <WorkspaceSettingsModal
          workspaceId={workspace.id}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

