import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, TextInput, Button, Alert, Stack, Text, Title, Anchor, List } from '@mantine/core';
import { api } from '../utils/api';
import { z } from 'zod';
import { validatePassword } from '../utils/password';

const resetPasswordSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!token) {
      setError('Invalid or missing reset token');
    }

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationErrors([]);

    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    try {
      // Validate password strength
      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.valid) {
        setValidationErrors(passwordValidation.errors);
        return;
      }

      const validated = resetPasswordSchema.parse(formData);
      setLoading(true);

      await api.resetPassword(token, validated.password);

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
      }, 2000);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message || 'Validation error');
      } else if (err instanceof Error) {
        setError(err.message || 'Failed to reset password');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Card shadow="xl" padding="xl" w="100%" maw={400} radius="md" withBorder>
          <Stack gap="md">
            <Alert color="red">
              Invalid or missing reset token
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
          <Title order={2} ta="center">Reset Password</Title>

          {success ? (
            <Alert color="green">
              Password reset successful! Redirecting to login...
            </Alert>
          ) : (
            <>
              {error && (
                <Alert color="red">
                  {error}
                </Alert>
              )}

              {validationErrors.length > 0 && (
                <Alert color="yellow">
                  <List>
                    {validationErrors.map((err, index) => (
                      <List.Item key={index}>{err}</List.Item>
                    ))}
                  </List>
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack gap="md">
                  <TextInput
                    label="New Password"
                    type="password"
                    placeholder="New Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.currentTarget.value })}
                    required
                    description="Must be at least 12 characters with uppercase, lowercase, number, and special character"
                  />

                  <TextInput
                    label="Confirm Password"
                    type="password"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.currentTarget.value })}
                    required
                  />

                  <Button
                    type="submit"
                    color="blue"
                    fullWidth
                    loading={loading}
                    mt="md"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
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

