import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, TextInput, Button, Alert, Stack, Text, Title, Anchor } from '@mantine/core';
import { api } from '../utils/api';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const validated = forgotPasswordSchema.parse({ email });
      await api.forgotPassword(validated.email);
      setSuccess(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message || 'Validation error');
      } else if (err instanceof Error) {
        setError(err.message || 'Failed to send password reset email');
      } else {
        setError('Failed to send password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Card shadow="xl" padding="xl" w="100%" maw={400} radius="md" withBorder>
        <Stack gap="lg">
          <Title order={2} ta="center">Forgot Password</Title>

          {success ? (
            <Stack gap="md">
              <Alert color="green">
                If an account with that email exists, a password reset link has been sent.
              </Alert>
              <Button component={Link} to="/login" color="blue" fullWidth>
                Back to Login
              </Button>
            </Stack>
          ) : (
            <>
              <Text size="sm" c="dimmed" ta="center">
                Enter your email address and we'll send you a link to reset your password.
              </Text>

              {error && (
                <Alert color="red">
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack gap="md">
                  <TextInput
                    label="Email"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    required
                  />

                  <Button
                    type="submit"
                    color="blue"
                    fullWidth
                    loading={loading}
                    mt="md"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </Stack>
              </form>

              <Text ta="center" size="sm" mt="md">
                <Anchor component={Link} to="/login" c="blue">
                  Back to Login
                </Anchor>
              </Text>
            </>
          )}
        </Stack>
      </Card>
    </div>
  );
}

