import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Alert, Stack, Title, Group, Box, Loader } from '@mantine/core';
import { api } from '../utils/api.js';

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const handleAccept = useCallback(async () => {
    if (!token || !isMountedRef.current) return;

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      await api.acceptInvite(token);

      if (!isMountedRef.current) return;

      setSuccess(true);

      // Clear existing timeout if any
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          navigate('/');
        }
        timeoutRef.current = null;
      }, 2000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [token, navigate]);

  useEffect(() => {
    isMountedRef.current = true;

    if (token) {
      void handleAccept();
    }

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [token, handleAccept]);

  if (loading) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader size="lg" />
      </Box>
    );
  }

  if (success) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Alert color="green" ta="center">
          Invite accepted successfully! Redirecting...
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Card shadow="lg" padding="xl" maw={400} radius="md" withBorder>
        <Stack gap="md">
          <Title order={2}>Accept Invite</Title>
          {error && (
            <Alert color="red">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" mt="md">
            <Button color="blue" onClick={handleAccept}>
              Accept Invite
            </Button>
            <Button variant="subtle" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </Card>
    </Box>
  );
}

