import { PasswordInput, Stack, TextInput, Textarea } from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import { normalizeGoogleOAuthCallbackUrl } from '../../../../shared/utils/googleOAuthCallbackUrl.js';
import {
  DEFAULT_VERIFICATION_SQL,
  readInputValue,
  type GoogleDraft,
  type MysqlDraft,
} from './helpers.js';

interface GoogleCredentialsFieldsProps {
  readonly googleDraft: GoogleDraft;
  readonly setGoogleDraft: Dispatch<SetStateAction<GoogleDraft>>;
  readonly googleReplaceMode: boolean;
}

export function GoogleCredentialsFields({
  googleDraft,
  setGoogleDraft,
  googleReplaceMode,
}: GoogleCredentialsFieldsProps) {
  return (
    <>
      <TextInput
        label="Client ID"
        name="google_oauth_client_id"
        autoComplete="off"
        value={googleDraft.clientId}
        onChange={(event) => setGoogleDraft((draft) => ({ ...draft, clientId: readInputValue(event) }))}
        placeholder="Google OAuth client ID"
      />
      <PasswordInput
        label="Client Secret"
        name="google_oauth_client_secret"
        autoComplete="new-password"
        value={googleDraft.clientSecret}
        onChange={(event) => setGoogleDraft((draft) => ({ ...draft, clientSecret: readInputValue(event) }))}
        placeholder={googleReplaceMode ? 'Leave blank to keep the existing secret' : 'Client secret'}
      />
      <TextInput
        label="Callback URL"
        description="Must match an authorized redirect URI in Google Cloud Console. Leave empty to rely on GOOGLE_CALLBACK_URL in the server environment or the default /api/v1/auth/google/callback path."
        name="google_oauth_callback_url"
        autoComplete="off"
        value={googleDraft.callbackUrl}
        onChange={(event) => setGoogleDraft((draft) => ({ ...draft, callbackUrl: readInputValue(event) }))}
        placeholder={normalizeGoogleOAuthCallbackUrl('')}
      />
    </>
  );
}

interface MysqlConnectionFieldsProps {
  readonly mysqlDraft: MysqlDraft;
  readonly setMysqlDraft: Dispatch<SetStateAction<MysqlDraft>>;
}

export function MysqlConnectionFields({ mysqlDraft, setMysqlDraft }: MysqlConnectionFieldsProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Database Host"
        name="external_mysql_host"
        autoComplete="off"
        placeholder="e.g., 35.123.45.67 or db.example.com:3306"
        value={mysqlDraft.host}
        onChange={(event) => setMysqlDraft((draft) => ({ ...draft, host: readInputValue(event) }))}
      />
      <TextInput
        label="Database Name"
        name="external_mysql_database"
        autoComplete="off"
        placeholder="e.g., myapp_production"
        value={mysqlDraft.database}
        onChange={(event) => setMysqlDraft((draft) => ({ ...draft, database: readInputValue(event) }))}
      />
      <TextInput
        label="Database User (read-only recommended)"
        name="external_mysql_username"
        autoComplete="off"
        placeholder="e.g., readonly_user"
        value={mysqlDraft.username}
        onChange={(event) => setMysqlDraft((draft) => ({ ...draft, username: readInputValue(event) }))}
      />
      <PasswordInput
        label="Database Password"
        name="external_mysql_password"
        autoComplete="new-password"
        placeholder="Enter password"
        value={mysqlDraft.password}
        onChange={(event) => setMysqlDraft((draft) => ({ ...draft, password: readInputValue(event) }))}
      />
      <Textarea
        label="Verification SQL Query"
        name="external_mysql_verification_sql"
        autoComplete="off"
        placeholder={DEFAULT_VERIFICATION_SQL}
        value={mysqlDraft.verificationQuery}
        onChange={(event) =>
          setMysqlDraft((draft) => ({
            ...draft,
            verificationQuery: readInputValue(event),
          }))
        }
        minRows={3}
        description="Use ? as a placeholder for the user's email address. The query should return at least one row if the user exists."
      />
    </Stack>
  );
}
