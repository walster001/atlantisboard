import { memo } from 'react';
import { Alert, Box, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { ExternalDatabaseSection, GoogleOAuthSection, LoginStyleSection } from './LoginOptionsSection/sections.js';
import { useLoginOptionsState } from './LoginOptionsSection/useLoginOptionsState.js';

function LoginOptionsSectionInner() {
  const {
    config,
    setConfig,
    mysqlDraft,
    setMysqlDraft,
    googleDraft,
    setGoogleDraft,
    mysqlReplaceMode,
    setMysqlReplaceMode,
    googleReplaceMode,
    setGoogleReplaceMode,
    dbFormOpen,
    setDbFormOpen,
    googleFormOpen,
    setGoogleFormOpen,
    loading,
    saving,
    testing,
    error,
    setError,
    success,
    mysqlTestError,
    setMysqlTestError,
    mysqlTestSuccess,
    setMysqlTestSuccess,
    extConfigured,
    googleConfigured,
    handleSave,
    handleSaveExternalDb,
    handleTestConnection,
    resetMysqlDraftFromConfig,
  } = useLoginOptionsState();

  if (loading || !config) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

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

      <LoginStyleSection config={config} setConfig={setConfig} googleConfigured={googleConfigured} />
      <GoogleOAuthSection
        config={config}
        setConfig={setConfig}
        googleConfigured={googleConfigured}
        googleReplaceMode={googleReplaceMode}
        setGoogleReplaceMode={setGoogleReplaceMode}
        googleFormOpen={googleFormOpen}
        setGoogleFormOpen={setGoogleFormOpen}
        googleDraft={googleDraft}
        setGoogleDraft={setGoogleDraft}
      />
      <ExternalDatabaseSection
        config={config}
        extConfigured={extConfigured}
        dbFormOpen={dbFormOpen}
        setDbFormOpen={setDbFormOpen}
        mysqlReplaceMode={mysqlReplaceMode}
        setMysqlReplaceMode={setMysqlReplaceMode}
        mysqlDraft={mysqlDraft}
        setMysqlDraft={setMysqlDraft}
        mysqlTestError={mysqlTestError}
        setMysqlTestError={setMysqlTestError}
        mysqlTestSuccess={mysqlTestSuccess}
        setMysqlTestSuccess={setMysqlTestSuccess}
        handleTestConnection={handleTestConnection}
        handleSaveExternalDb={handleSaveExternalDb}
        resetMysqlDraftFromConfig={resetMysqlDraftFromConfig}
        saving={saving}
        testing={testing}
      />
    </Stack>
  );
}

export const LoginOptionsSection = memo(LoginOptionsSectionInner);
