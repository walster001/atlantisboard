import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Title, Tabs, Container } from '@mantine/core';
import { PermissionSetsTab } from './PermissionSetsTab.js';
import { SystemConfigTab } from './SystemConfigTab.js';
import { useAuthContext } from '../../contexts/AuthContext.js';

export function AdminPanel() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthContext();

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user == null || user.isAppAdmin !== true) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const [activeTab, setActiveTab] = useState<'permissions' | 'system-config'>('permissions');

  if (authLoading || user == null || user.isAppAdmin !== true) {
    return null;
  }

  return (
    <Box className="min-h-screen" style={{ backgroundColor: 'var(--mantine-color-body)' }}>
      <Box
        p="md"
        style={{
          backgroundColor: 'var(--mantine-color-gray-1)',
          boxShadow: 'var(--mantine-shadow-md)',
          borderBottom: '1px solid var(--mantine-color-gray-3)',
        }}
      >
        <Title order={3}>Admin Panel</Title>
      </Box>

      <Container p="md">
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab((value || 'permissions') as typeof activeTab)}
          mb="md"
        >
          <Tabs.List>
            <Tabs.Tab value="permissions">Permissions Roles</Tabs.Tab>
            <Tabs.Tab value="system-config">System Configuration</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="permissions">
            <PermissionSetsTab />
          </Tabs.Panel>
          <Tabs.Panel value="system-config">
            <SystemConfigTab />
          </Tabs.Panel>
        </Tabs>
      </Container>
    </Box>
  );
}

