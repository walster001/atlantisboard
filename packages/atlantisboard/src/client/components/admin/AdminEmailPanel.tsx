import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Badge,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMail, IconSend } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import {
  SMTP_PROVIDER_PRESETS,
  SMTP_PROVIDER_OPTIONS,
  type SmtpProviderKey,
} from '../../../shared/constants/smtpProviderPresets.js';

type SmtpProvider = SmtpProviderKey | 'custom';

interface SmtpFormState {
  provider: SmtpProvider;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  enabled: boolean;
}

const DEFAULT_FORM_STATE: SmtpFormState = {
  provider: 'custom',
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromAddress: '',
  fromName: '',
  enabled: false,
};

function isPresetKey(value: string): value is SmtpProviderKey {
  return value in SMTP_PROVIDER_PRESETS;
}

export const AdminEmailPanel = memo(function AdminEmailPanel() {
  const [form, setForm] = useState<SmtpFormState>(DEFAULT_FORM_STATE);
  const [passwordSet, setPasswordSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    void loadConfig();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadConfig = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await api.getAdminConfig();
      if (!isMountedRef.current) return;

      const cfg = response.config as Record<string, unknown>;
      const smtp = (cfg?.smtp ?? {}) as Record<string, unknown>;

      setForm({
        provider: (typeof smtp.provider === 'string' ? smtp.provider : 'custom') as SmtpProvider,
        host: typeof smtp.host === 'string' ? smtp.host : '',
        port: typeof smtp.port === 'number' ? smtp.port : 587,
        secure: typeof smtp.secure === 'boolean' ? smtp.secure : false,
        username: typeof smtp.username === 'string' ? smtp.username : '',
        password: '',
        fromAddress: typeof smtp.fromAddress === 'string' ? smtp.fromAddress : '',
        fromName: typeof smtp.fromName === 'string' ? smtp.fromName : '',
        enabled: typeof smtp.enabled === 'boolean' ? smtp.enabled : false,
      });
      setPasswordSet(typeof smtp.passwordSet === 'boolean' ? smtp.passwordSet : false);
    } catch {
      if (!isMountedRef.current) return;
      notifications.show({
        title: 'Error',
        message: 'Failed to load email configuration.',
        color: 'red',
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleProviderChange = useCallback((value: string | null) => {
    if (value == null) return;
    const provider = value as SmtpProvider;

    setForm((prev) => {
      if (isPresetKey(provider)) {
        const preset = SMTP_PROVIDER_PRESETS[provider];
        return {
          ...prev,
          provider,
          host: preset.host,
          port: preset.port,
          secure: preset.secure,
        };
      }
      return { ...prev, provider, host: '', port: 587, secure: false };
    });
  }, []);

  const updateField = useCallback(<K extends keyof SmtpFormState>(key: K, value: SmtpFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        provider: form.provider,
        host: form.host,
        port: form.port,
        secure: form.secure,
        username: form.username,
        fromAddress: form.fromAddress,
        fromName: form.fromName,
        enabled: form.enabled,
      };

      if (form.password.length > 0) {
        payload.password = form.password;
      }

      const response = await api.updateAdminConfig({ smtp: payload });
      if (!isMountedRef.current) return;

      const updatedCfg = response.config as Record<string, unknown>;
      const updatedSmtp = (updatedCfg?.smtp ?? {}) as Record<string, unknown>;
      setPasswordSet(typeof updatedSmtp.passwordSet === 'boolean' ? updatedSmtp.passwordSet : false);
      setForm((prev) => ({ ...prev, password: '' }));

      notifications.show({
        title: 'Saved',
        message: 'Email configuration updated successfully.',
        color: 'green',
      });
    } catch {
      if (!isMountedRef.current) return;
      notifications.show({
        title: 'Error',
        message: 'Failed to save email configuration.',
        color: 'red',
      });
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSendTest = async (): Promise<void> => {
    if (testEmail.trim().length === 0) return;
    try {
      setSendingTest(true);
      const result = await api.testSmtpEmail(testEmail.trim());
      if (!isMountedRef.current) return;

      if (result.ok) {
        notifications.show({
          title: 'Test email sent',
          message: result.message,
          color: 'green',
        });
      } else {
        notifications.show({
          title: 'Test email failed',
          message: result.message,
          color: 'red',
        });
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof Error ? err.message : 'Failed to send test email.';
      notifications.show({
        title: 'Error',
        message,
        color: 'red',
      });
    } finally {
      if (isMountedRef.current) {
        setSendingTest(false);
      }
    }
  };

  if (loading) {
    return (
      <Stack gap="md">
        <Title order={3}>Email</Title>
        <Text size="sm" c="dimmed">Loading email configuration…</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={4}>
          <Title order={3}>Email</Title>
          <Text size="sm" c="dimmed">
            Configure SMTP relay settings for outbound emails such as password resets and notifications.
          </Text>
        </Stack>
      </Group>

      <Paper withBorder p="md" radius="sm">
        <Stack gap="md">
          <Switch
            label="Enable SMTP email"
            description="When enabled, the application will use these settings to send emails."
            thumbIcon={null}
            withThumbIndicator={false}
            checked={form.enabled}
            onChange={(e) => updateField('enabled', e.currentTarget.checked)}
          />

          <Divider />

          <Select
            label="Provider"
            description="Select a provider to auto-fill connection settings, or choose Custom."
            data={SMTP_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={form.provider}
            onChange={handleProviderChange}
            allowDeselect={false}
          />

          <Group grow align="flex-start">
            <TextInput
              label="SMTP Host"
              placeholder="smtp.example.com"
              value={form.host}
              onChange={(e) => updateField('host', e.currentTarget.value)}
            />
            <NumberInput
              label="Port"
              placeholder="587"
              min={1}
              max={65535}
              value={form.port}
              onChange={(val) => updateField('port', typeof val === 'number' ? val : 587)}
            />
          </Group>

          <Switch
            label="Use TLS/SSL (secure)"
            description="Enable for port 465. Port 587 typically uses STARTTLS (leave disabled)."
            thumbIcon={null}
            withThumbIndicator={false}
            checked={form.secure}
            onChange={(e) => updateField('secure', e.currentTarget.checked)}
          />

          <Divider label="Authentication" labelPosition="left" />

          <TextInput
            label="Username"
            placeholder="SMTP username or email"
            value={form.username}
            onChange={(e) => updateField('username', e.currentTarget.value)}
          />

          <div>
            <PasswordInput
              label="Password"
              placeholder={passwordSet ? 'Leave empty to keep existing password' : 'SMTP password or app password'}
              value={form.password}
              onChange={(e) => updateField('password', e.currentTarget.value)}
            />
            {passwordSet && form.password.length === 0 && (
              <Badge variant="light" color="green" size="sm" mt={4}>
                Password is set
              </Badge>
            )}
          </div>

          <Divider label="Sender" labelPosition="left" />

          <Group grow align="flex-start">
            <TextInput
              label="From address"
              placeholder="noreply@example.com"
              value={form.fromAddress}
              onChange={(e) => updateField('fromAddress', e.currentTarget.value)}
            />
            <TextInput
              label="From name"
              placeholder="Atlantisboard"
              value={form.fromName}
              onChange={(e) => updateField('fromName', e.currentTarget.value)}
            />
          </Group>

          <Group justify="flex-end">
            <Button
              loading={saving}
              onClick={() => void handleSave()}
            >
              Save email settings
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="sm">
        <Stack gap="md">
          <Group gap="xs">
            <IconMail size={20} stroke={1.5} />
            <Text fw={600}>Send test email</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Send a test message using the saved SMTP configuration to verify connectivity.
          </Text>
          <Group align="flex-end">
            <TextInput
              label="Recipient email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconSend size={16} />}
              loading={sendingTest}
              disabled={testEmail.trim().length === 0}
              onClick={() => void handleSendTest()}
              variant="light"
            >
              Send test email
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
});
