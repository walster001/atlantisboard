import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
  startTransition,
  type ChangeEvent,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconDeviceFloppy, IconPlug } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import { normalizeGoogleOAuthCallbackUrl } from '../../../shared/utils/googleOAuthCallbackUrl.js';

type DefaultAuthMethod = 'email' | 'google' | 'google-external';

interface AdminConfigShape {
  authMethods: {
    emailPassword: boolean;
    googleOAuth: boolean;
    googleOAuthExternalMySQL: boolean;
  };
  googleOAuth: {
    enabled: boolean;
    clientIdSet?: boolean;
    clientSecretSet?: boolean;
    callbackUrlSet?: boolean;
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
  };
  externalMySQL: {
    enabled: boolean;
    credentialsConfigured?: boolean;
    passwordSet?: boolean;
    verificationQuerySet?: boolean;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    verificationQuery?: string;
  };
  defaultAuthMethod: DefaultAuthMethod;
}

interface MysqlDraft {
  host: string;
  database: string;
  username: string;
  password: string;
  verificationQuery: string;
}

interface GoogleDraft {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

const DEFAULT_VERIFICATION_SQL = 'SELECT 1 FROM users WHERE email = ? LIMIT 1';

function readInputValue(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): string {
  return event.currentTarget?.value ?? '';
}

function splitMysqlHostInput(raw: string, defaultPort: number): { host: string; port: number } {
  const t = raw.trim();
  const lastColon = t.lastIndexOf(':');
  if (lastColon > 0) {
    const maybePort = t.slice(lastColon + 1);
    if (/^\d{1,5}$/.test(maybePort)) {
      return { host: t.slice(0, lastColon), port: Number(maybePort) };
    }
  }
  return { host: t, port: defaultPort };
}

function formatMysqlHostForDisplay(host: string | undefined, port: number | undefined): string {
  if (!host) {
    return '';
  }
  if (port !== undefined && port !== 3306) {
    return `${host}:${port}`;
  }
  return host;
}

function applyAuthMode(
  prev: AdminConfigShape,
  mode: DefaultAuthMethod
): AdminConfigShape {
  const go = prev.googleOAuth ?? { enabled: false };
  const ext = prev.externalMySQL ?? { enabled: false };
  if (mode === 'email') {
    return {
      ...prev,
      defaultAuthMethod: 'email',
      authMethods: {
        emailPassword: true,
        googleOAuth: false,
        googleOAuthExternalMySQL: false,
      },
      googleOAuth: { ...go, enabled: false },
      externalMySQL: { ...ext, enabled: false },
    };
  }
  if (mode === 'google') {
    return {
      ...prev,
      defaultAuthMethod: 'google',
      authMethods: {
        emailPassword: false,
        googleOAuth: true,
        googleOAuthExternalMySQL: false,
      },
      googleOAuth: { ...go, enabled: true },
      externalMySQL: { ...ext, enabled: false },
    };
  }
  return {
    ...prev,
    defaultAuthMethod: 'google-external',
    authMethods: {
      emailPassword: false,
      googleOAuth: true,
      googleOAuthExternalMySQL: true,
    },
    googleOAuth: { ...go, enabled: true },
    externalMySQL: { ...ext, enabled: true },
  };
}

function LoginOptionsSectionInner() {
  const [config, setConfig] = useState<AdminConfigShape | null>(null);
  const [mysqlDraft, setMysqlDraft] = useState<MysqlDraft>({
    host: '',
    database: '',
    username: '',
    password: '',
    verificationQuery: DEFAULT_VERIFICATION_SQL,
  });
  const [googleDraft, setGoogleDraft] = useState<GoogleDraft>({
    clientId: '',
    clientSecret: '',
    callbackUrl: '',
  });
  const [mysqlReplaceMode, setMysqlReplaceMode] = useState(false);
  const [googleReplaceMode, setGoogleReplaceMode] = useState(false);
  const [dbFormOpen, setDbFormOpen] = useState(true);
  const [googleFormOpen, setGoogleFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mysqlTestError, setMysqlTestError] = useState<string | null>(null);
  const [mysqlTestSuccess, setMysqlTestSuccess] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const prevAuthMethodRef = useRef<DefaultAuthMethod | null>(null);

  const showToast = useCallback((message: string) => {
    setSuccess(message);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setSuccess(null);
      timeoutRef.current = null;
    }, 3000);
  }, []);

  const resetMysqlDraftFromConfig = useCallback((c: AdminConfigShape) => {
    const ext = c.externalMySQL ?? { enabled: false };
    const mConfigured = ext.credentialsConfigured === true;
    if (mConfigured) {
      setMysqlDraft({
        host: '',
        database: '',
        username: '',
        password: '',
        verificationQuery: DEFAULT_VERIFICATION_SQL,
      });
      setMysqlReplaceMode(false);
      setDbFormOpen(false);
    } else {
      const vq = ext.verificationQuery;
      const verificationQuery =
        typeof vq === 'string' && vq.trim() !== '' ? vq.trim() : DEFAULT_VERIFICATION_SQL;
      setMysqlDraft({
        host: formatMysqlHostForDisplay(ext.host, ext.port),
        database: ext.database || '',
        username: ext.username || '',
        password: '',
        verificationQuery,
      });
      setMysqlReplaceMode(false);
      setDbFormOpen(true);
    }
  }, []);

  const applyLoadedConfig = useCallback((c: AdminConfigShape) => {
    setConfig(c);
    resetMysqlDraftFromConfig(c);
    const go = c.googleOAuth ?? { enabled: false };
    const gConfigured = !!(go.clientIdSet && go.clientSecretSet);
    setGoogleDraft({
      clientId: gConfigured ? '' : (go.clientId || ''),
      clientSecret: '',
      callbackUrl: gConfigured ? '' : (go.callbackUrl || ''),
    });
    setGoogleReplaceMode(false);
    setGoogleFormOpen(!gConfigured);
  }, [resetMysqlDraftFromConfig]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getAdminConfig();
      const c = response.config as AdminConfigShape;
      if (!isMountedRef.current) {
        return;
      }
      applyLoadedConfig(c);
    } catch (err) {
      if (isMountedRef.current) {
        setError('Failed to load configuration');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyLoadedConfig]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadConfig();
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [loadConfig]);

  /** After auth method changes, reset Google / MySQL UI so Mantine inputs are not torn down mid-update. */
  useEffect(() => {
    if (!config) {
      return;
    }
    const method = config.defaultAuthMethod;
    if (prevAuthMethodRef.current === method) {
      return;
    }
    prevAuthMethodRef.current = method;

    if (method === 'google' || method === 'google-external') {
      const gCfg = !!(config.googleOAuth?.clientIdSet && config.googleOAuth?.clientSecretSet);
      setGoogleReplaceMode(false);
      setGoogleFormOpen(!gCfg);
    } else {
      setGoogleReplaceMode(false);
      setGoogleFormOpen(false);
    }

    if (method === 'google-external') {
      resetMysqlDraftFromConfig(config);
      setMysqlTestError(null);
      setMysqlTestSuccess(null);
    } else {
      setMysqlReplaceMode(false);
      setMysqlTestError(null);
      setMysqlTestSuccess(null);
    }
  }, [config, resetMysqlDraftFromConfig]);

  const persistFromPayload = async (payload: Record<string, unknown>, message: string) => {
    try {
      setSaving(true);
      setError(null);
      const { config: saved } = await api.updateAdminConfig(payload);
      if (!isMountedRef.current) {
        return;
      }
      applyLoadedConfig(saved as AdminConfigShape);
      showToast(message);
    } catch (err) {
      if (isMountedRef.current) {
        setError('Failed to save configuration');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSave = async () => {
    if (!config) {
      return;
    }
    const payload: Record<string, unknown> = {
      authMethods: config.authMethods,
      defaultAuthMethod: config.defaultAuthMethod,
    };

    const googleConfigured = !!(config.googleOAuth.clientIdSet && config.googleOAuth.clientSecretSet);

    if (config.defaultAuthMethod === 'google' || config.defaultAuthMethod === 'google-external') {
      if (googleReplaceMode || !googleConfigured) {
        const go: Record<string, unknown> = {
          enabled: config.googleOAuth.enabled,
          clientId: googleDraft.clientId.trim(),
          callbackUrl: normalizeGoogleOAuthCallbackUrl(googleDraft.callbackUrl),
        };
        if (googleDraft.clientSecret.trim() !== '') {
          go.clientSecret = googleDraft.clientSecret;
        }
        if (googleReplaceMode) {
          go.replaceGoogleOAuth = true;
        }
        payload.googleOAuth = go;
      } else {
        payload.googleOAuth = { enabled: config.googleOAuth.enabled };
      }
    }

    if (config.defaultAuthMethod === 'google-external') {
      const extCfg = config.externalMySQL.credentialsConfigured === true;
      const includeMysqlDraft = !extCfg || mysqlReplaceMode;
      if (includeMysqlDraft) {
        const { host, port } = splitMysqlHostInput(mysqlDraft.host.trim(), 3306);
        if (host && mysqlDraft.database.trim() && mysqlDraft.username.trim()) {
          payload.externalMySQL = {
            enabled: true,
            replaceCredentials: extCfg && mysqlReplaceMode,
            host,
            port,
            database: mysqlDraft.database.trim(),
            username: mysqlDraft.username.trim(),
            password: mysqlDraft.password,
            verificationQuery: mysqlDraft.verificationQuery.trim() || DEFAULT_VERIFICATION_SQL,
          };
        } else {
          payload.externalMySQL = { enabled: config.externalMySQL.enabled };
        }
      } else {
        payload.externalMySQL = { enabled: config.externalMySQL.enabled };
      }
    } else {
      payload.externalMySQL = { enabled: false };
    }

    await persistFromPayload(payload, 'Configuration saved successfully');
  };

  const handleSaveExternalDb = async () => {
    if (!config) {
      return;
    }
    const { host, port } = splitMysqlHostInput(mysqlDraft.host.trim(), 3306);
    if (!mysqlDraft.database.trim() || !mysqlDraft.username.trim()) {
      setMysqlTestError('Database name and user are required');
      setMysqlTestSuccess(null);
      return;
    }
    if (!host) {
      setMysqlTestError('Database host is required');
      setMysqlTestSuccess(null);
      return;
    }

    const payload: Record<string, unknown> = {
      externalMySQL: {
        enabled: true,
        replaceCredentials: config.externalMySQL.credentialsConfigured === true,
        host,
        port,
        database: mysqlDraft.database.trim(),
        username: mysqlDraft.username.trim(),
        password: mysqlDraft.password,
        verificationQuery: mysqlDraft.verificationQuery.trim() || DEFAULT_VERIFICATION_SQL,
      },
    };

    setMysqlTestError(null);
    setMysqlTestSuccess(null);
    await persistFromPayload(payload, 'Database configuration saved');
  };

  const handleTestConnection = async () => {
    if (!config) {
      return;
    }
    setMysqlTestError(null);
    setMysqlTestSuccess(null);
    try {
      setTesting(true);
      const useSaved =
        config.externalMySQL.credentialsConfigured === true && !mysqlReplaceMode;

      let result: { ok: boolean; message: string };

      if (useSaved) {
        result = await api.testExternalMysqlConnection({ useSavedCredentials: true });
      } else {
        const { host, port } = splitMysqlHostInput(mysqlDraft.host.trim(), 3306);
        if (!host || !mysqlDraft.database.trim() || !mysqlDraft.username.trim()) {
          setMysqlTestError('Host, database name, and user are required to test the connection');
          return;
        }
        result = await api.testExternalMysqlConnection({
          host,
          port,
          database: mysqlDraft.database.trim(),
          username: mysqlDraft.username.trim(),
          password: mysqlDraft.password,
          verificationQuery: mysqlDraft.verificationQuery.trim() || DEFAULT_VERIFICATION_SQL,
        });
      }

      if (result.ok) {
        setMysqlTestSuccess(result.message);
      } else {
        setMysqlTestError(result.message);
      }
    } catch (err) {
      setMysqlTestError('Connection test failed');
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  if (loading || !config) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

  const extConfigured = config.externalMySQL.credentialsConfigured === true;
  const googleConfigured = !!(config.googleOAuth.clientIdSet && config.googleOAuth.clientSecretSet);

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

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={3}>Login Options</Title>
          <Text size="sm" c="dimmed" maw={520} mt="xs">
            Configure how users authenticate with your application.
          </Text>
        </Box>
        <Button color="blue" onClick={() => void handleSave()} loading={saving} disabled={saving}>
          Save Changes
        </Button>
      </Group>

      {error && (
        <Alert color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}

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
              const mode = value;
              startTransition(() => {
                setConfig((c) => (c ? applyAuthMode(c, mode) : c));
              });
            }}
          />
          <Alert color="gray" variant="light">
            {methodDescription}
          </Alert>
        </Stack>
      </Card>

      {(config.defaultAuthMethod === 'google' ||
        config.defaultAuthMethod === 'google-external') && (
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
                  onClick={() => setGoogleFormOpen((o) => !o)}
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
              OAuth redirect URI in Google Cloud console must match the callback URL you configure
              below (or <code>GOOGLE_CALLBACK_URL</code> in the server environment, which takes
              precedence). You can set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>{' '}
              in <code>.env</code>; when set, they override the Client ID and Client Secret fields
              here.
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
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <Stack gap="md">
                  {(!googleConfigured || googleReplaceMode) && (
                    <>
                      <TextInput
                        label="Client ID"
                        name="google_oauth_client_id"
                        autoComplete="off"
                        value={googleDraft.clientId}
                        onChange={(e) =>
                          setGoogleDraft((d) => ({ ...d, clientId: readInputValue(e) }))
                        }
                        placeholder="Google OAuth client ID"
                      />
                      <PasswordInput
                        label="Client Secret"
                        name="google_oauth_client_secret"
                        autoComplete="new-password"
                        value={googleDraft.clientSecret}
                        onChange={(e) =>
                          setGoogleDraft((d) => ({ ...d, clientSecret: readInputValue(e) }))
                        }
                        placeholder={
                          googleReplaceMode
                            ? 'Leave blank to keep the existing secret'
                            : 'Client secret'
                        }
                      />
                      <TextInput
                        label="Callback URL"
                        description="Must match an authorized redirect URI in Google Cloud Console. Leave empty to rely on GOOGLE_CALLBACK_URL in the server environment or the default /api/v1/auth/google/callback path."
                        name="google_oauth_callback_url"
                        autoComplete="off"
                        value={googleDraft.callbackUrl}
                        onChange={(e) =>
                          setGoogleDraft((d) => ({ ...d, callbackUrl: readInputValue(e) }))
                        }
                        placeholder="https://your-domain.com/api/v1/auth/google/callback"
                      />
                      {googleReplaceMode && (
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => {
                            setGoogleReplaceMode(false);
                            setGoogleDraft({
                              clientId: googleConfigured
                                ? ''
                                : (config.googleOAuth?.clientId || ''),
                              clientSecret: '',
                              callbackUrl: googleConfigured
                                ? ''
                                : (config.googleOAuth?.callbackUrl || ''),
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
      )}

      {config.defaultAuthMethod === 'google-external' && (
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
              onClick={() => setDbFormOpen((o) => !o)}
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
                    Connection details and verification SQL are stored encrypted on the server. Test
                    the saved connection below, or use <strong>Replace connection</strong> to enter
                    new values.
                  </Alert>
                )}
                {mysqlTestError && (
                  <Alert
                    color="red"
                    onClose={() => setMysqlTestError(null)}
                    withCloseButton
                  >
                    {mysqlTestError}
                  </Alert>
                )}
                {mysqlTestSuccess && (
                  <Alert color="green" onClose={() => setMysqlTestSuccess(null)} withCloseButton>
                    {mysqlTestSuccess}
                  </Alert>
                )}
                <Alert color="yellow" variant="light">
                  Use a read-only database user when possible. Secrets are never returned to the
                  browser after save.
                </Alert>
                {(!extConfigured || mysqlReplaceMode) && (
                  <form
                    autoComplete="off"
                    onSubmit={(e) => {
                      e.preventDefault();
                    }}
                  >
                    <Stack gap="md">
                      <TextInput
                        label="Database Host"
                        name="external_mysql_host"
                        autoComplete="off"
                        placeholder="e.g., 35.123.45.67 or db.example.com:3306"
                        value={mysqlDraft.host}
                        onChange={(e) =>
                          setMysqlDraft((d) => ({ ...d, host: readInputValue(e) }))
                        }
                      />
                      <TextInput
                        label="Database Name"
                        name="external_mysql_database"
                        autoComplete="off"
                        placeholder="e.g., myapp_production"
                        value={mysqlDraft.database}
                        onChange={(e) =>
                          setMysqlDraft((d) => ({ ...d, database: readInputValue(e) }))
                        }
                      />
                      <TextInput
                        label="Database User (read-only recommended)"
                        name="external_mysql_username"
                        autoComplete="off"
                        placeholder="e.g., readonly_user"
                        value={mysqlDraft.username}
                        onChange={(e) =>
                          setMysqlDraft((d) => ({ ...d, username: readInputValue(e) }))
                        }
                      />
                      <PasswordInput
                        label="Database Password"
                        name="external_mysql_password"
                        autoComplete="new-password"
                        placeholder="Enter password"
                        value={mysqlDraft.password}
                        onChange={(e) =>
                          setMysqlDraft((d) => ({ ...d, password: readInputValue(e) }))
                        }
                        description={
                          mysqlReplaceMode
                            ? 'Leave blank to keep the saved password'
                            : undefined
                        }
                      />
                      <Textarea
                        label="Verification SQL Query"
                        name="external_mysql_verification_sql"
                        autoComplete="off"
                        placeholder={DEFAULT_VERIFICATION_SQL}
                        value={mysqlDraft.verificationQuery}
                        onChange={(e) =>
                          setMysqlDraft((d) => ({
                            ...d,
                            verificationQuery: readInputValue(e),
                          }))
                        }
                        minRows={3}
                        description="Use ? as a placeholder for the user's email address. The query should return at least one row if the user exists."
                      />
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
      )}
    </Stack>
  );
}

export const LoginOptionsSection = memo(LoginOptionsSectionInner);
