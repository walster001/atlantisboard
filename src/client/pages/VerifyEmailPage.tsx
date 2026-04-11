import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Card, Button, Alert, Stack, Title, Loader, Box } from '@mantine/core';
import { api } from '../utils/api';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const verifyEmail = async () => {
      if (!token) {
        if (isMountedRef.current) {
          setError('Invalid or missing verification token');
          setLoading(false);
        }
        return;
      }

      try {
        await api.verifyEmail(token);
        
        if (!isMountedRef.current) return;

        setSuccess(true);
        
        // Clear existing timeout if any
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            navigate('/login');
          }
          timeoutRef.current = null;
        }, 3000);
      } catch (err) {
        if (!isMountedRef.current) return;
        if (err instanceof Error) {
          setError(err.message || 'Failed to verify email');
        } else {
          setError('Failed to verify email. Please try again.');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void verifyEmail();

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Card shadow="xl" padding="xl" w="100%" maw={400} radius="md" withBorder>
        <Stack gap="lg">
          <Title order={2} ta="center">Email Verification</Title>

          {loading ? (
            <Box ta="center" py="xl">
              <Loader size="lg" />
            </Box>
          ) : success ? (
            <Stack gap="md">
              <Alert color="green">
                Email verified successfully! Redirecting to login...
              </Alert>
              <Button component={Link} to="/login" color="blue" fullWidth>
                Go to Login
              </Button>
            </Stack>
          ) : (
            <Stack gap="md">
              <Alert color="red">
                {error || 'Failed to verify email'}
              </Alert>
              <Stack gap="xs">
                <Button component={Link} to="/login" color="blue" fullWidth>
                  Back to Login
                </Button>
                <Button component={Link} to="/register" variant="subtle" fullWidth>
                  Register New Account
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Card>
    </div>
  );
}

