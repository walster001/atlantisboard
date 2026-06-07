import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Card, Button, Alert, Stack, Title, Text, Anchor } from '@mantine/core';
import { isAxiosError } from 'axios';
import { api } from '../utils/api';
import { useAuthContext } from '../contexts/AuthContext';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuthContext();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleVerify = async () => {
    if (!token) {
      setError('Invalid or missing verification token');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await api.verifyEmail(token);

      if (!isMountedRef.current) return;

      setSuccess(true);
      await refreshUser();

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
      if (isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
        setError(msg ?? 'Failed to verify email. The link may have expired.');
      } else if (err instanceof Error) {
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

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Card shadow="xl" padding="xl" w="100%" maw={400} radius="md" withBorder>
          <Stack gap="md">
            <Title order={2} ta="center">Email Verification</Title>
            <Alert color="red">
              Invalid or missing verification token
            </Alert>
            <Button component={Link} to="/login" color="blue" fullWidth>
              Back to Login
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Card shadow="xl" padding="xl" w="100%" maw={400} radius="md" withBorder>
        <Stack gap="lg">
          <Title order={2} ta="center">Email Verification</Title>

          {success ? (
            <Stack gap="md">
              <Alert color="green">
                Email verified successfully! Signing you in...
              </Alert>
              <Button component={Link} to="/" color="blue" fullWidth>
                Go to Dashboard
              </Button>
            </Stack>
          ) : (
            <Stack gap="md">
              {error && (
                <Alert color="red">
                  {error}
                </Alert>
              )}

              <Text ta="center" size="sm">
                Click the button below to confirm your email address.
              </Text>

              <Button
                color="blue"
                fullWidth
                loading={loading}
                onClick={() => {
                  void handleVerify();
                }}
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </Button>

              <Text ta="center" size="sm">
                <Anchor component={Link} to="/login" c="blue">
                  Back to Login
                </Anchor>
              </Text>
            </Stack>
          )}
        </Stack>
      </Card>
    </div>
  );
}
