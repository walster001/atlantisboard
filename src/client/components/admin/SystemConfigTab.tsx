import { useState, useEffect, useRef } from 'react';
import { Card, NumberInput, Button, Alert, Stack, Group, Text, Title, Loader, Box, Grid } from '@mantine/core';
import { api } from '../../utils/api.js';

interface AdminConfig {
  rateLimiting: {
    authEndpoints: {
      attempts: number;
      windowMinutes: number;
    };
    fileUploads: {
      attempts: number;
      windowMinutes: number;
    };
    generalAPI: {
      attempts: number;
      windowMinutes: number;
    };
  };
}

export function SystemConfigTab() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    void loadConfig();

    // Cleanup timeout on unmount
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const loadConfig = async () => {
    if (!isMountedRef.current) return;

    try {
      if (isMountedRef.current) {
        setLoading(true);
      }
      const response = await api.getAdminConfig();

      if (!isMountedRef.current) return;

      setConfig(response.config as AdminConfig);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError('Failed to load configuration');
      console.error(err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      await api.updateAdminConfig(config);
      setSuccess(true);
      
      // Clear existing timeout if any
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setSuccess(false);
        timeoutRef.current = null;
      }, 3000);
    } catch (err) {
      setError('Failed to save configuration');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <Loader size="lg" />
      </Box>
    );
  }

  if (!config) {
    return <Box p="md"><Text c="red">Failed to load configuration</Text></Box>;
  }

  return (
    <Stack gap="lg">
      {error && (
        <Alert color="red">
          {error}
        </Alert>
      )}

      {success && (
        <Alert color="green">
          Configuration saved successfully
        </Alert>
      )}

      <Alert color="blue" variant="light" mb="md">
        Authentication methods are configured under Admin Configuration → Login options.
      </Alert>

      <Alert color="blue" variant="light" mb="md">
        Login screen branding is configured under Admin Configuration → Customisation → Login branding.
      </Alert>

      {/* Rate Limiting */}
      <Card shadow="xl" style={{ backgroundColor: 'var(--mantine-color-gray-1)' }}>
        <Stack gap="md">
          <Title order={3}>Rate Limiting Configuration</Title>
          <Stack gap="md">
            <Box>
              <Text fw={600} mb="xs">Authentication Endpoints</Text>
              <Grid>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Attempts"
                    value={config.rateLimiting.authEndpoints.attempts}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          authEndpoints: {
                            ...config.rateLimiting.authEndpoints,
                            attempts: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Window (minutes)"
                    value={config.rateLimiting.authEndpoints.windowMinutes}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          authEndpoints: {
                            ...config.rateLimiting.authEndpoints,
                            windowMinutes: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
              </Grid>
            </Box>

            <Box>
              <Text fw={600} mb="xs">File Uploads</Text>
              <Grid>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Attempts"
                    value={config.rateLimiting.fileUploads.attempts}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          fileUploads: {
                            ...config.rateLimiting.fileUploads,
                            attempts: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Window (minutes)"
                    value={config.rateLimiting.fileUploads.windowMinutes}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          fileUploads: {
                            ...config.rateLimiting.fileUploads,
                            windowMinutes: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
              </Grid>
            </Box>

            <Box>
              <Text fw={600} mb="xs">General API</Text>
              <Grid>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Attempts"
                    value={config.rateLimiting.generalAPI.attempts}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          generalAPI: {
                            ...config.rateLimiting.generalAPI,
                            attempts: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="Window (minutes)"
                    value={config.rateLimiting.generalAPI.windowMinutes}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        rateLimiting: {
                          ...config.rateLimiting,
                          generalAPI: {
                            ...config.rateLimiting.generalAPI,
                            windowMinutes: typeof value === 'number' ? value : 1,
                          },
                        },
                      })
                    }
                    min={1}
                  />
                </Grid.Col>
              </Grid>
            </Box>
          </Stack>
        </Stack>
      </Card>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button
          color="blue"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
        >
          Save Configuration
        </Button>
      </Group>
    </Stack>
  );
}

