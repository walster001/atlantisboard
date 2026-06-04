import { Box, Stack, Text, Title } from '@mantine/core';
import { AppAdminMemberManagement } from '../AppAdminMemberManagement.js';
import type { AppAdminRow } from './types.js';

interface RolesPermissionsAppAdminsPanelProps {
  readonly appAdmins: readonly AppAdminRow[];
  readonly load: () => Promise<void>;
  readonly currentUserId: string | undefined;
  readonly bootstrapAppAdminId: string | null;
  readonly showHeader: boolean;
}

export function RolesPermissionsAppAdminsPanel({
  appAdmins,
  load,
  currentUserId,
  bootstrapAppAdminId,
  showHeader,
}: RolesPermissionsAppAdminsPanelProps) {
  return (
    <Box className="roles-permissions-tab__app-admins-panel">
      {showHeader ? (
        <Stack gap="xs" style={{ flexShrink: 0 }} mb="sm">
          <Title order={4}>App Admins</Title>
          <Text size="sm" c="dimmed">
            Grant or revoke global App Admin access. App admins can access this admin configuration/modify
            all aspects of the app.
          </Text>
        </Stack>
      ) : null}
      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AppAdminMemberManagement
          appAdmins={appAdmins}
          onAppAdminsChange={load}
          currentUserId={currentUserId}
          bootstrapAppAdminId={bootstrapAppAdminId}
        />
      </Box>
    </Box>
  );
}
