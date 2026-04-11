import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Title, Text, Stack, Anchor, Loader } from '@mantine/core';
import { api } from '../utils/api.js';

export default function RegisterPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opts = await api.getLoginOptions();
        if (!cancelled) {
          setAllowed(opts.emailPassword);
        }
      } catch {
        if (!cancelled) {
          setAllowed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader />
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Box className="min-h-screen flex items-center justify-center" p="md">
        <Stack align="center" gap="md" maw={420}>
          <Title order={2}>Registration unavailable</Title>
          <Text ta="center" c="dimmed">
            This application uses Google sign-in only. New accounts are created when you sign in with
            Google for the first time.
          </Text>
          <Anchor component={Link} to="/login" fw={500}>
            Back to sign in
          </Anchor>
        </Stack>
      </Box>
    );
  }

  return (
    <Box className="min-h-screen flex items-center justify-center">
      <Stack align="center" gap="md">
        <Title order={2}>Register</Title>
        <Text>Registration page - placeholder</Text>
      </Stack>
    </Box>
  );
}
