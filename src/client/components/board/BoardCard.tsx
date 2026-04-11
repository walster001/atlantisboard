import { Link } from 'react-router-dom';
import { Card, Text, Badge, Box, Title } from '@mantine/core';
import type { BoardDB } from '../../store/database';

interface BoardCardProps {
  board: BoardDB;
}

export function BoardCard({ board }: BoardCardProps) {
  return (
    <Link to={`/boards/${board.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <Card
        shadow="md"
        style={{
          cursor: 'pointer',
          transition: 'box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--mantine-shadow-xl)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--mantine-shadow-md)';
        }}
      >
        {board.background && (
          <Box
            h={128}
            style={{
              backgroundImage: `url(${board.background})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              margin: 'calc(var(--mantine-spacing-md) * -1)',
              marginBottom: 'var(--mantine-spacing-md)',
              borderRadius: 'var(--mantine-radius-md) var(--mantine-radius-md) 0 0',
            }}
          >
            {!board.background.match(/^https?:\/\//) && (
              <Box
                h="100%"
                w="100%"
                style={{
                  background: 'linear-gradient(to bottom right, rgba(59, 130, 246, 0.2), rgba(14, 165, 233, 0.2))',
                }}
              />
            )}
          </Box>
        )}
        <Title order={4} mb="xs">{board.name}</Title>
        {board.description && (
          <Text size="sm" c="dimmed" lineClamp={2} mb="xs">{board.description}</Text>
        )}
        <Box style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--mantine-spacing-xs)' }}>
          <Badge variant="outline">{board.visibility}</Badge>
        </Box>
      </Card>
    </Link>
  );
}

