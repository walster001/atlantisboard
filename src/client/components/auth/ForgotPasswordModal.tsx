import { useState, type FormEvent, type ReactElement } from 'react';
import { isAxiosError } from 'axios';
import { Alert, Button, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { z } from 'zod';
import { api } from '../../utils/api.js';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

function messageFromForgotApiError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string; errors?: readonly { message?: string }[] } }
      | undefined;
    if (data?.error?.message) {
      return data.error.message;
    }
    const issues = data?.error?.errors;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0];
      if (first && typeof first === 'object' && 'message' in first && typeof first.message === 'string') {
        return first.message;
      }
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Failed to send password reset email. Please try again.';
}

export interface ForgotPasswordModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

function ForgotPasswordModalBody({ onClose }: { readonly onClose: () => void }): ReactElement {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
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
        setError(err.issues[0]?.message ?? 'Validation error');
      } else {
        setError(messageFromForgotApiError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {success ? (
        <Stack gap="md" pt="xs">
          <Alert color="green">
            If an account with that email exists, a password reset link has been sent.
          </Alert>
          <Button type="button" onClick={onClose} fullWidth>
            Close
          </Button>
        </Stack>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)}>
          <Stack gap="md" pt="xs">
            <Text size="sm" c="dimmed" ta="center">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </Text>
            {error ? (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            ) : null}
            <TextInput
              label="Email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                const next = e.currentTarget.value;
                setEmail(next);
              }}
              required
              autoComplete="email"
            />
            <Button type="submit" fullWidth loading={loading} mt="xs">
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </Stack>
        </form>
      )}
    </>
  );
}

export function ForgotPasswordModal({ opened, onClose }: ForgotPasswordModalProps): ReactElement {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Forgot password</Title>}
      centered
      overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
    >
      {opened ? <ForgotPasswordModalBody onClose={onClose} /> : null}
    </Modal>
  );
}
