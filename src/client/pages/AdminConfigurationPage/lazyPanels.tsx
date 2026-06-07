import { lazy } from 'react';
import { Group, Text } from '@mantine/core';

export const AdminUsersTab = lazy(async () => {
  const m = await import('../../components/admin/AdminUsersTab.js');
  return { default: m.AdminUsersTab };
});

export const AdminEmailPanel = lazy(async () => {
  const m = await import('../../components/admin/AdminEmailPanel.js');
  return { default: m.AdminEmailPanel };
});

export const AdminDatabasePanel = lazy(async () => {
  const m = await import('../../components/admin/AdminDatabasePanel.js');
  return { default: m.AdminDatabasePanel };
});

export const AdminFileStoragePanel = lazy(async () => {
  const m = await import('../../components/admin/AdminFileStoragePanel.js');
  return { default: m.AdminFileStoragePanel };
});

export const AdminBackupPanel = lazy(async () => {
  const m = await import('../../components/admin/AdminBackupPanel.js');
  return { default: m.AdminBackupPanel };
});

export const AdminMonitorPanel = lazy(async () => {
  const m = await import('../../components/admin/AdminMonitorPanel.js');
  return { default: m.AdminMonitorPanel };
});

export function LoaderCentered() {
  return (
    <Group justify="center" py="md">
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    </Group>
  );
}
