import { startTransition, type Dispatch, type SetStateAction } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Group,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconDeviceFloppy, IconPlug } from '@tabler/icons-react';
import {
  DEFAULT_VERIFICATION_SQL,
  applyAuthMode,
  registrationModeDescription,
  type AdminConfigShape,
  type DefaultAuthMethod,
  type GoogleDraft,
  type MysqlDraft,
  type RegistrationMode,
} from '../LoginOptionsSection/helpers.js';
import { GoogleCredentialsFields, MysqlConnectionFields } from './sectionFormFields.js';
interface LoginStyleSectionProps {
  readonly config: AdminConfigShape;
  readonly setConfig: Dispatch<SetStateAction<AdminConfigShape | null>>;
}

export function LoginStyleSection({ config, setConfig }: LoginStyleSectionProps) {
  const authMethodSelectData: { value: DefaultAuthMethod; label: string }[] = [
    { value: 'email', label: 'Local Accounts' },
    { value: 'google', label: 'Google Login Only' },
    { value: 'google-external', label: 'Google Login + Database Verification' },
  ];

  const methodDescription =
    config.defaultAuthMethod === 'email'
      ? 'Users sign in and register with email and password only. Google sign-in is hidden.'
      : config.defaultAuthMethod === 'google'
        ? 'Only Google sign-in is available. Local login and registration are hidden.'
        : 'Google sign-in with additional database verification. Users must exist in the external MySQL database.';

  const registrationSelectData: { value: RegistrationMode; label: string }[] = [
    { value: 'open', label: 'Open registration' },
    { value: 'invite-only', label: 'Invite-only' },
    { value: 'disabled', label: 'Disabled' },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>Login Style</Title>
        <Text size="sm" c="dimmed">
          Choose how users will authenticate with your application.
        </Text>
        <Select
          label="Authentication Method"
          data={authMethodSelectData}
          value={config.defaultAuthMethod}
          allowDeselect={false}
          onChange={(value) => {
            if (value === null) {
              return;
            }
            if (value !== 'email' && value !== 'google' && value !== 'google-external') {
              return;
            }
            startTransition(() => {
              setConfig((c) => (c ? applyAuthMode(c, value) : c));
            });
          }}
        />
        <Alert color="gray" variant="light">
          {methodDescription}
        </Alert>
        <Select
          label="New account registration"
          description={registrationModeDescription(config.defaultAuthMethod, config.registrationMode)}
          data={registrationSelectData}
          value={config.registrationMode}
          allowDeselect={false}
          onChange={(value) => {
            if (value !== 'open' && value !== 'invite-only' && value !== 'disabled') {
              return;
            }
            startTransition(() => {
              setConfig((c) => (c ? { ...c, registrationMode: value } : c));
            });
          }}
        />
      </Stack>
    </Card>
  );
}

interface GoogleOAuthSectionProps {
  readonly config: AdminConfigShape;
  readonly googleConfigured: boolean;
  readonly googleReplaceMode: boolean;
  readonly setGoogleReplaceMode: Dispatch<SetStateAction<boolean>>;
  readonly googleFormOpen: boolean;
  readonly setGoogleFormOpen: Dispatch<SetStateAction<boolean>>;
  readonly googleDraft: GoogleDraft;
  readonly setGoogleDraft: Dispatch<SetStateAction<GoogleDraft>>;
}
export function GoogleOAuthSection({
  config,
  googleConfigured,
  googleReplaceMode,
  setGoogleReplaceMode,
  googleFormOpen,
  setGoogleFormOpen,
  googleDraft,
  setGoogleDraft,
}: GoogleOAuthSectionProps) {
  if (config.defaultAuthMethod !== 'google' && config.defaultAuthMethod !== 'google-external') {
    return null;
  }
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={4}>Google OAuth</Title>
          <Group gap="xs">
            {googleConfigured && !googleReplaceMode && (
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setGoogleReplaceMode(true);
                  setGoogleDraft({ clientId: '', clientSecret: '', callbackUrl: '' });
                  setGoogleFormOpen(true);
                }}
              >
                Replace credentials
              </Button>
            )}
            <UnstyledButton
              onClick={() => setGoogleFormOpen((open) => !open)}
              c="blue"
              fz="sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {googleFormOpen ? 'Hide' : 'Show'}
              {googleFormOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </UnstyledButton>
          </Group>
        </Group>
        <Alert color="blue" variant="light">
          OAuth redirect URI in Google Cloud console must match the callback URL you configure below
          (or <code>GOOGLE_CALLBACK_URL</code> in the server environment, which takes precedence).
          You can set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in{' '}
          <code>.env</code>; when set, they override the Client ID and Client Secret fields here.
        </Alert>
        {googleConfigured && !googleReplaceMode && (
          <Alert color="teal" variant="light">
            Google OAuth credentials are stored encrypted on the server and are not shown here.
            {config.googleOAuth.callbackUrlSet ? (
              <>
                {' '}
                A callback URL is saved on the server (not shown).{' '}
              </>
            ) : null}
            Use <strong>Replace credentials</strong> to enter new values.
          </Alert>
        )}
        <Collapse in={googleFormOpen}>
          <form
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Stack gap="md">
              {(!googleConfigured || googleReplaceMode) && (
                <>
                  <GoogleCredentialsFields
                    googleDraft={googleDraft}
                    setGoogleDraft={setGoogleDraft}
                    googleReplaceMode={googleReplaceMode}
                  />
                  {googleReplaceMode && (
                    <Button
                      type="button"
                      variant="subtle"
                      onClick={() => {
                        setGoogleReplaceMode(false);
                        setGoogleDraft({
                          clientId: googleConfigured ? '' : (config.googleOAuth?.clientId || ''),
                          clientSecret: '',
                          callbackUrl: googleConfigured ? '' : (config.googleOAuth?.callbackUrl || ''),
                        });
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </Stack>
          </form>
        </Collapse>
      </Stack>
    </Card>
  );
}

interface ExternalDatabaseSectionProps {
  readonly config: AdminConfigShape;
  readonly extConfigured: boolean;
  readonly dbFormOpen: boolean;
  readonly setDbFormOpen: Dispatch<SetStateAction<boolean>>;
  readonly mysqlReplaceMode: boolean;
  readonly setMysqlReplaceMode: Dispatch<SetStateAction<boolean>>;
  readonly mysqlDraft: MysqlDraft;
  readonly setMysqlDraft: Dispatch<SetStateAction<MysqlDraft>>;
  readonly mysqlTestError: string | null;
  readonly setMysqlTestError: Dispatch<SetStateAction<string | null>>;
  readonly mysqlTestSuccess: string | null;
  readonly setMysqlTestSuccess: Dispatch<SetStateAction<string | null>>;
  readonly handleTestConnection: () => Promise<void>;
  readonly handleSaveExternalDb: () => Promise<void>;
  readonly resetMysqlDraftFromConfig: (config: AdminConfigShape) => void;
  readonly saving: boolean;
  readonly testing: boolean;
}
export function ExternalDatabaseSection({
  config,
  extConfigured,
  dbFormOpen,
  setDbFormOpen,
  mysqlReplaceMode,
  setMysqlReplaceMode,
  mysqlDraft,
  setMysqlDraft,
  mysqlTestError,
  setMysqlTestError,
  mysqlTestSuccess,
  setMysqlTestSuccess,
  handleTestConnection,
  handleSaveExternalDb,
  resetMysqlDraftFromConfig,
  saving,
  testing,
}: ExternalDatabaseSectionProps) {
  if (config.defaultAuthMethod !== 'google-external') {
    return null;
  }
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={4}>External Database Configuration</Title>
          <Group gap="xs">
            {extConfigured ? (
              <Text size="sm" c="teal" fw={500}>
                Configured
              </Text>
            ) : (
              <Text size="sm" c="orange" fw={500}>
                Not configured
              </Text>
            )}
          </Group>
        </Group>
        <UnstyledButton
          onClick={() => setDbFormOpen((open) => !open)}
          mb="xs"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Text fw={600} size="sm" c="blue">
            Configure Database Connection {dbFormOpen ? '(click to collapse)' : '(click to expand)'}
          </Text>
          {dbFormOpen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </UnstyledButton>
        <Collapse in={dbFormOpen}>
          <Stack gap="md">
            {extConfigured && !mysqlReplaceMode && (
              <Alert color="teal" variant="light">
                Connection details and verification SQL are stored encrypted on the server. Test the
                saved connection below, or use <strong>Replace connection</strong> to enter new values.
              </Alert>
            )}
            {mysqlTestError && (
              <Alert color="red" onClose={() => setMysqlTestError(null)} withCloseButton>
                {mysqlTestError}
              </Alert>
            )}
            {mysqlTestSuccess && (
              <Alert color="green" onClose={() => setMysqlTestSuccess(null)} withCloseButton>
                {mysqlTestSuccess}
              </Alert>
            )}
            <Alert color="yellow" variant="light">
              Use a read-only database user when possible. Secrets are never returned to the browser
              after save.
            </Alert>
            {(!extConfigured || mysqlReplaceMode) && (
              <form
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <Stack gap="md">
                  <MysqlConnectionFields mysqlDraft={mysqlDraft} setMysqlDraft={setMysqlDraft} />
                  {mysqlReplaceMode ? (
                    <Text size="sm" c="dimmed">
                      Leave password blank to keep the saved password.
                    </Text>
                  ) : null}
                </Stack>
              </form>
            )}
            {extConfigured && !mysqlReplaceMode && (
              <Button
                variant="light"
                onClick={() => {
                  setMysqlReplaceMode(true);
                  setMysqlDraft({
                    host: '',
                    database: '',
                    username: '',
                    password: '',
                    verificationQuery: DEFAULT_VERIFICATION_SQL,
                  });
                  setMysqlTestError(null);
                  setMysqlTestSuccess(null);
                }}
              >
                Replace connection
              </Button>
            )}
            {mysqlReplaceMode && (
              <Button
                variant="subtle"
                onClick={() => {
                  setMysqlTestError(null);
                  setMysqlTestSuccess(null);
                  resetMysqlDraftFromConfig(config);
                }}
              >
                Cancel
              </Button>
            )}
            <Group>
              <Button
                variant="light"
                leftSection={<IconPlug size={18} />}
                onClick={() => void handleTestConnection()}
                loading={testing}
              >
                Test Connection
              </Button>
              {(!extConfigured || mysqlReplaceMode) && (
                <Button
                  color="blue"
                  leftSection={<IconDeviceFloppy size={18} />}
                  onClick={() => void handleSaveExternalDb()}
                  loading={saving}
                >
                  Save Configuration
                </Button>
              )}
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}
