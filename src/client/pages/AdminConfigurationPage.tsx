import { lazy, Suspense, useState, startTransition, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Box,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBuildingCog,
  IconSparkles,
  IconTool,
} from '@tabler/icons-react';
import './adminConfigurationPage.css';
import { LoginOptionsSection } from '../components/admin/LoginOptionsSection.js';
import { LoginBrandingSection } from '../components/admin/LoginBrandingSection.js';
import { AppBrandingSection } from '../components/admin/AppBrandingSection.js';
import { CustomFontsSection } from '../components/admin/CustomFontsSection.js';
import { RolesPermissionsTab } from '../components/admin/RolesPermissionsTab.js';
import { useAuthContext } from '../contexts/AuthContext.js';
import { useResponsiveTier } from '../hooks/useResponsiveTier.js';

const AdminUsersTab = lazy(async () => {
  const m = await import('../components/admin/AdminUsersTab.js');
  return { default: m.AdminUsersTab };
});

const AdminBackupPanel = lazy(async () => {
  const m = await import('../components/admin/AdminBackupPanel.js');
  return { default: m.AdminBackupPanel };
});

const AdminMonitorPanel = lazy(async () => {
  const m = await import('../components/admin/AdminMonitorPanel.js');
  return { default: m.AdminMonitorPanel };
});

/** Main Configuration / Customisation pill tabs */
const MAIN_TAB_ICON_SIZE = 22;
const MAIN_TAB_ICON_STROKE = 1.5;

const CONFIGURATION_SUBTABS = [
  { value: 'general', label: 'General' },
  { value: 'login-options', label: 'Login options' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'users', label: 'Users' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'backup', label: 'Backup' },
  { value: 'monitor', label: 'Monitor' },
] as const;

const CUSTOMISATION_SUBTABS = [
  { value: 'login-branding', label: 'Login branding' },
  { value: 'app-branding', label: 'App branding' },
  { value: 'custom-fonts', label: 'Custom fonts' },
  { value: 'templates', label: 'Templates' },
] as const;

type ConfigurationSubtab = (typeof CONFIGURATION_SUBTABS)[number]['value'];
type CustomisationSubtab = (typeof CUSTOMISATION_SUBTABS)[number]['value'];

export default function AdminConfigurationPage() {
  const navigate = useNavigate();
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const { user, loading: authLoading } = useAuthContext();

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user == null || user.isAppAdmin !== true) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const [mainTab, setMainTab] = useState<'configuration' | 'customisation'>('configuration');
  const [configSubtab, setConfigSubtab] = useState<ConfigurationSubtab>('general');
  const [mobileConfigOpen, setMobileConfigOpen] = useState<ConfigurationSubtab | null>(null);
  const [customisationSubtab, setCustomisationSubtab] =
    useState<CustomisationSubtab>('login-branding');

  const handleBack = (): void => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const activeSubLabel =
    CONFIGURATION_SUBTABS.find((t) => t.value === configSubtab)?.label ?? configSubtab;

  const activeCustomisationSubLabel =
    CUSTOMISATION_SUBTABS.find((t) => t.value === customisationSubtab)?.label ??
    customisationSubtab;

  if (authLoading || user == null || user.isAppAdmin !== true) {
    return null;
  }

  if (isMobile) {
    const sectionLabel =
      CONFIGURATION_SUBTABS.find((t) => t.value === mobileConfigOpen)?.label ?? mobileConfigOpen;
    return (
      <Box className="admin-configuration-page admin-configuration-page--mobile">
        <Group className="admin-configuration-page__header" gap="sm" wrap="nowrap" align="center">
          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="lg"
            radius="md"
            onClick={() => {
              if (mobileConfigOpen != null) {
                setMobileConfigOpen(null);
                return;
              }
              handleBack();
            }}
            aria-label="Go back"
          >
            <IconArrowLeft size={22} stroke={1.5} />
          </ActionIcon>
          <Title order={2} size="h4">
            {mobileConfigOpen == null ? 'Admin Configuration' : sectionLabel}
          </Title>
        </Group>
        <Tabs
          value={mainTab}
          color="blue"
          variant="pills"
          radius="sm"
          onChange={(v) => {
            if (v === 'configuration' || v === 'customisation') {
              startTransition(() => setMainTab(v));
              setMobileConfigOpen(null);
            }
          }}
        >
          <Tabs.List className="admin-configuration-page__main-tabs-list admin-configuration-page__main-tabs-list--mobile">
            <Tabs.Tab value="configuration" aria-label="Configuration">
              <IconTool size={18} stroke={1.5} />
            </Tabs.Tab>
            <Tabs.Tab value="customisation" aria-label="Customisation">
              <IconSparkles size={18} stroke={1.5} />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
        {mainTab === 'configuration' ? (
          mobileConfigOpen == null ? (
            <Stack gap="xs">
              {CONFIGURATION_SUBTABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className="admin-configuration-page__mobile-row"
                  onClick={() => setMobileConfigOpen(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </Stack>
          ) : (
            <Box className="admin-configuration-page__mobile-content">
              {mobileConfigOpen === 'login-options' ? (
                <LoginOptionsSection />
              ) : mobileConfigOpen === 'permissions' ? (
                <RolesPermissionsTab />
              ) : mobileConfigOpen === 'users' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminUsersTab currentUserId={user.id} />
                </Suspense>
              ) : mobileConfigOpen === 'backup' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminBackupPanel />
                </Suspense>
              ) : mobileConfigOpen === 'monitor' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminMonitorPanel />
                </Suspense>
              ) : (
                <Stack gap="xs">
                  <Title order={3}>{sectionLabel}</Title>
                  <Text size="sm" c="dimmed">
                    This section will be configured in a follow-up change.
                  </Text>
                </Stack>
              )}
            </Box>
          )
        ) : (
          <Box className="admin-configuration-page__mobile-content">
            {customisationSubtab === 'login-branding' ? (
              <LoginBrandingSection />
            ) : customisationSubtab === 'app-branding' ? (
              <AppBrandingSection />
            ) : customisationSubtab === 'custom-fonts' ? (
              <CustomFontsSection />
            ) : (
              <Stack gap="xs">
                <Title order={3}>{activeCustomisationSubLabel}</Title>
                <Text size="sm" c="dimmed">
                  This section will be configured in a follow-up change.
                </Text>
              </Stack>
            )}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box className="admin-configuration-page">
      <Group className="admin-configuration-page__header" gap="sm" wrap="nowrap" align="center">
        <ActionIcon
          type="button"
          variant="subtle"
          color="gray"
          size="lg"
          radius="md"
          onClick={handleBack}
          aria-label="Go back"
        >
          <IconArrowLeft size={22} stroke={1.5} />
        </ActionIcon>
        <Box aria-hidden>
          <IconBuildingCog size={40} stroke={1.5} color="var(--mantine-color-gray-6)" />
        </Box>
        <Title order={2} size="h3">
          Admin Configuration
        </Title>
      </Group>

      <Tabs
        value={mainTab}
        color="blue"
        variant="pills"
        radius="sm"
        onChange={(v) => {
          if (v === 'configuration' || v === 'customisation') {
            startTransition(() => setMainTab(v));
          }
        }}
        className="admin-configuration-page__main-tabs"
      >
        <Tabs.List mb="xs" className="admin-configuration-page__main-tabs-list">
          <Tabs.Tab
            value="configuration"
            leftSection={<IconTool size={MAIN_TAB_ICON_SIZE} stroke={MAIN_TAB_ICON_STROKE} />}
          >
            Configuration
          </Tabs.Tab>
          <Tabs.Tab
            value="customisation"
            leftSection={
              <IconSparkles size={MAIN_TAB_ICON_SIZE} stroke={MAIN_TAB_ICON_STROKE} />
            }
          >
            Customisation
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="configuration" pt="md" className="admin-configuration-page__configuration-panel">
          <div
            className={
              configSubtab === 'permissions'
                ? 'admin-configuration-page__layout admin-configuration-page__layout--permissions'
                : 'admin-configuration-page__layout'
            }
          >
            <nav className="admin-configuration-page__sidebar" aria-label="Configuration sections">
              {CONFIGURATION_SUBTABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className="admin-configuration-page__subtab"
                  data-active={configSubtab === tab.value ? 'true' : 'false'}
                  onClick={() => {
                    startTransition(() => setConfigSubtab(tab.value));
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <Box className="admin-configuration-page__content">
              {configSubtab === 'login-options' ? (
                <LoginOptionsSection />
              ) : configSubtab === 'permissions' ? (
                <RolesPermissionsTab />
              ) : configSubtab === 'users' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminUsersTab currentUserId={user.id} />
                </Suspense>
              ) : configSubtab === 'backup' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminBackupPanel />
                </Suspense>
              ) : configSubtab === 'monitor' ? (
                <Suspense fallback={<LoaderCentered />}>
                  <AdminMonitorPanel />
                </Suspense>
              ) : (
                <Stack gap="xs">
                  <Title order={3}>{activeSubLabel}</Title>
                  <Text size="sm" c="dimmed">
                    This section will be configured in a follow-up change.
                  </Text>
                </Stack>
              )}
            </Box>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="customisation" pt="md">
          <div
            className={
              customisationSubtab === 'login-branding' || customisationSubtab === 'app-branding'
                ? 'admin-configuration-page__layout admin-configuration-page__layout--sticky-preview'
                : 'admin-configuration-page__layout'
            }
          >
            <nav className="admin-configuration-page__sidebar" aria-label="Customisation sections">
              {CUSTOMISATION_SUBTABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className="admin-configuration-page__subtab"
                  data-active={customisationSubtab === tab.value ? 'true' : 'false'}
                  onClick={() => {
                    startTransition(() => setCustomisationSubtab(tab.value));
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <Box className="admin-configuration-page__content">
              {customisationSubtab === 'login-branding' ? (
                <LoginBrandingSection />
              ) : customisationSubtab === 'app-branding' ? (
                <AppBrandingSection />
              ) : customisationSubtab === 'custom-fonts' ? (
                <CustomFontsSection />
              ) : (
                <Stack gap="xs">
                  <Title order={3}>{activeCustomisationSubLabel}</Title>
                  <Text size="sm" c="dimmed">
                    This section will be configured in a follow-up change.
                  </Text>
                </Stack>
              )}
            </Box>
          </div>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

function LoaderCentered() {
  return (
    <Group justify="center" py="md">
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    </Group>
  );
}
