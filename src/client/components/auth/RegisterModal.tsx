import { useState, type FormEvent, type ReactElement } from 'react';
import { isAxiosError } from 'axios';
import {
  Alert,
  Button,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { z } from 'zod';
import { useAuthContext } from '../../contexts/AuthContext.js';
import { api } from '../../utils/api.js';
import { validatePassword } from '../../utils/password.js';
import { PasswordStrengthMeter } from './PasswordStrengthMeter.js';

const registerFormSchema = z
  .object({
    displayName: z.string().min(1, 'Full name is required').max(100, 'Full name is too long'),
    username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username is too long'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(12, 'Password must be at least 12 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

function messageFromUnknownApiError(err: unknown): string {
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
  return 'Registration failed. Please try again.';
}

export interface RegisterModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Called after successful registration (e.g. navigate home). */
  readonly onSuccess?: () => void;
}

type RegisterFormState = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const emptyForm: RegisterFormState = {
  displayName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function VerificationSentView({
  email,
  onClose,
}: {
  readonly email: string;
  readonly onClose: () => void;
}): ReactElement {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await api.resendVerification(email);
      setResent(true);
    } catch {
      // Silently handle — endpoint always returns success to avoid enumeration
    } finally {
      setResending(false);
    }
  };

  return (
    <Stack gap="md" pt="xs">
      <Alert color="blue" title="Check your email">
        We sent a verification link to <strong>{email}</strong>. Click the link in the email to activate your account and sign in.
      </Alert>
      <Text size="sm" c="dimmed">
        The link expires in 10 minutes. If you don&apos;t see it, check your spam folder.
      </Text>
      {resent ? (
        <Alert color="green" variant="light">
          Verification email resent.
        </Alert>
      ) : (
        <Button variant="subtle" fullWidth loading={resending} onClick={() => void handleResend()}>
          Resend verification email
        </Button>
      )}
      <Button variant="light" fullWidth onClick={onClose}>
        Close
      </Button>
    </Stack>
  );
}

function RegisterModalBody({
  onClose,
  onSuccess,
}: {
  readonly onClose: () => void;
  readonly onSuccess?: (() => void) | undefined;
}): ReactElement {
  const { register } = useAuthContext();
  const [form, setForm] = useState<RegisterFormState>({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const parsed = registerFormSchema.parse(form);
      const pw = validatePassword(parsed.password);
      if (!pw.valid) {
        setError(pw.errors[0] ?? 'Password does not meet requirements');
        return;
      }
      setLoading(true);
      const result = await register({
        displayName: parsed.displayName.trim(),
        username: parsed.username.trim(),
        email: parsed.email.trim(),
        password: parsed.password,
      });

      if (
        result != null &&
        typeof result === 'object' &&
        'verificationRequired' in result &&
        (result as { verificationRequired?: boolean }).verificationRequired
      ) {
        setVerificationEmail(parsed.email.trim());
        return;
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? 'Validation error');
      } else {
        setError(messageFromUnknownApiError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  if (verificationEmail != null) {
    return <VerificationSentView email={verificationEmail} onClose={onClose} />;
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
        <Stack gap="md" pt="xs">
          {error ? (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          ) : null}
          <TextInput
            label="Full name"
            placeholder="Your name"
            value={form.displayName}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setForm((f) => ({ ...f, displayName: next }));
            }}
            required
            autoComplete="name"
          />
          <TextInput
            label="Username"
            placeholder="Choose a username"
            value={form.username}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setForm((f) => ({ ...f, username: next }));
            }}
            required
            autoComplete="username"
          />
          <TextInput
            label="Email"
            type="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setForm((f) => ({ ...f, email: next }));
            }}
            required
            autoComplete="email"
          />
          <PasswordInput
            label="Password"
            placeholder="Create a password"
            value={form.password}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setForm((f) => ({ ...f, password: next }));
            }}
            required
            autoComplete="new-password"
          />
          <PasswordInput
            label="Repeat password"
            placeholder="Confirm password"
            value={form.confirmPassword}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setForm((f) => ({ ...f, confirmPassword: next }));
            }}
            required
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={form.password} />
          <Button type="submit" fullWidth loading={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </Stack>
      </form>
  );
}

export function RegisterModal({ opened, onClose, onSuccess }: RegisterModalProps): ReactElement {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Create account</Title>}
      centered
      overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
    >
      {opened ? <RegisterModalBody onClose={onClose} onSuccess={onSuccess} /> : null}
    </Modal>
  );
}
