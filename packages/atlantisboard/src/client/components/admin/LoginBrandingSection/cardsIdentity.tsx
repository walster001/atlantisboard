import { memo, type ChangeEvent, type RefObject } from 'react';
import { ActionIcon, Box, Button, Card, ColorInput, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import { BrandingSwitch } from '../BrandingSwitch.js';
import { LOGIN_LOGO_SIZE_OPTIONS } from '../../../../shared/types/loginBranding.js';
import type { BrandingHandlers } from './types.js';

const TITLE_SIZE_OPTIONS = ['32', '36', '40', '44', '48', '56'].map((value) => ({ value, label: `${value}px` }));
const TAGLINE_SIZE_OPTIONS = ['14', '16', '18', '20', '22', '24'].map((value) => ({ value, label: `${value}px` }));
const LOGO_SIZE_SELECT_DATA = [...LOGIN_LOGO_SIZE_OPTIONS];

export const LoginBrandingLogoCard = memo(function LoginBrandingLogoCard({
  logoEnabled,
  logo,
  logoSizePx,
  handlers,
  logoInputRef,
  onLogoFileChange,
  onPickLogoClick,
  onClearLogo,
}: {
  readonly logoEnabled: boolean;
  readonly logo: string | undefined;
  readonly logoSizePx: number;
  readonly handlers: BrandingHandlers;
  readonly logoInputRef: RefObject<HTMLInputElement | null>;
  readonly onLogoFileChange: (file: File | null) => void;
  readonly onPickLogoClick: () => void;
  readonly onClearLogo: () => void;
}) {
  const hasUploadedLogo = Boolean(logo?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Custom Login Logo</Title>
          <Text size="sm" c="dimmed" mt={4}>Display a custom logo on the sign-in screen.</Text>
        </div>
        <BrandingSwitch
          label="Enable custom logo"
          checked={logoEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setLogoEnabled(e.currentTarget.checked)}
        />
        <Text fw={500} size="sm">Logo Image</Text>
        <Group align="flex-end" wrap="wrap">
          {hasUploadedLogo ? (
            <Box pos="relative" style={{ width: 96, height: 96 }}>
              <Box component="img" src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--mantine-color-gray-3)' }} />
              <ActionIcon color="red" variant="filled" size="sm" radius="xl" pos="absolute" top={4} right={4} aria-label="Remove logo" onClick={onClearLogo}>
                <IconX size={14} />
              </ActionIcon>
            </Box>
          ) : (
            <Box w={96} h={96} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8, background: 'var(--mantine-color-gray-0)' }} />
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => onLogoFileChange(e.target.files?.[0] ?? null)}
          />
          <Button variant="light" leftSection={<IconUpload size={18} />} onClick={onPickLogoClick}>
            {hasUploadedLogo ? 'Replace' : 'Upload'}
          </Button>
        </Group>
        <Select label="Logo Size" data={LOGO_SIZE_SELECT_DATA} value={String(logoSizePx)} onChange={handlers.setLogoSizePx} />
      </Stack>
    </Card>
  );
});

export const LoginBrandingAppNameCard = memo(function LoginBrandingAppNameCard({
  appNameEnabled,
  appName,
  appNameFontFamily,
  appNameFontSizePx,
  appNameColor,
  fontSelectData,
  handlers,
}: {
  readonly appNameEnabled: boolean;
  readonly appName: string | undefined;
  readonly appNameFontFamily: string;
  readonly appNameFontSizePx: number;
  readonly appNameColor: string;
  readonly fontSelectData: { value: string; label: string }[];
  readonly handlers: BrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Custom App Name</Title>
          <Text size="sm" c="dimmed" mt={4}>Shown on the sign-in screen and the home navigation after you save.</Text>
        </div>
        <BrandingSwitch label="Enable custom app name" checked={appNameEnabled} onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setAppNameEnabled(e.currentTarget.checked)} />
        <TextInput label="Application Name" value={appName ?? ''} onChange={(e) => handlers.setAppName(e.currentTarget.value)} disabled={!appNameEnabled} />
        <Select label="Font" data={fontSelectData} value={appNameFontFamily} onChange={handlers.setAppNameFontFamily} disabled={!appNameEnabled} />
        <Text size="xs" c="dimmed">Add fonts under Customisation → Custom fonts. Only System UI and uploaded fonts appear here.</Text>
        <Group grow align="flex-end">
          <Select label="Size & Color" data={TITLE_SIZE_OPTIONS} value={String(appNameFontSizePx)} onChange={handlers.setAppNameFontSizePx} disabled={!appNameEnabled} />
          <ColorInput label=" " value={appNameColor} onChange={handlers.setAppNameColor} disabled={!appNameEnabled} />
        </Group>
      </Stack>
    </Card>
  );
});

export const LoginBrandingTaglineCard = memo(function LoginBrandingTaglineCard({
  taglineEnabled,
  tagline,
  taglineFontFamily,
  taglineFontSizePx,
  taglineColor,
  fontSelectData,
  handlers,
}: {
  readonly taglineEnabled: boolean;
  readonly tagline: string | undefined;
  readonly taglineFontFamily: string;
  readonly taglineFontSizePx: number;
  readonly taglineColor: string;
  readonly fontSelectData: { value: string; label: string }[];
  readonly handlers: BrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Custom Tagline</Title>
          <Text size="sm" c="dimmed" mt={4}>Display a custom tagline below the app name.</Text>
        </div>
        <BrandingSwitch label="Enable custom tagline" checked={taglineEnabled} onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setTaglineEnabled(e.currentTarget.checked)} />
        <TextInput label="Tagline Text" value={tagline ?? ''} onChange={(e) => handlers.setTagline(e.currentTarget.value)} disabled={!taglineEnabled} />
        <Select label="Font" data={fontSelectData} value={taglineFontFamily} onChange={handlers.setTaglineFontFamily} disabled={!taglineEnabled} />
        <Text size="xs" c="dimmed">Same font list as app name (Customisation → Custom fonts).</Text>
        <Group grow align="flex-end">
          <Select label="Size & Color" data={TAGLINE_SIZE_OPTIONS} value={String(taglineFontSizePx)} onChange={handlers.setTaglineFontSizePx} disabled={!taglineEnabled} />
          <ColorInput label=" " value={taglineColor} onChange={handlers.setTaglineColor} disabled={!taglineEnabled} />
        </Group>
      </Stack>
    </Card>
  );
});

export const LoginBrandingBrowserTabCard = memo(function LoginBrandingBrowserTabCard({
  browserTabTitleEnabled,
  browserTabTitle,
  faviconEnabled,
  faviconUrl,
  handlers,
  faviconInputRef,
  onFaviconFileChange,
  onPickFaviconClick,
  onClearFavicon,
}: {
  readonly browserTabTitleEnabled: boolean;
  readonly browserTabTitle: string | undefined;
  readonly faviconEnabled: boolean;
  readonly faviconUrl: string | undefined;
  readonly handlers: BrandingHandlers;
  readonly faviconInputRef: RefObject<HTMLInputElement | null>;
  readonly onFaviconFileChange: (file: File | null) => void;
  readonly onPickFaviconClick: () => void;
  readonly onClearFavicon: () => void;
}) {
  const hasFavicon = Boolean(faviconUrl?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Browser Tab &amp; Favicon</Title>
        <Text size="sm" c="dimmed">After you save, the tab title and favicon apply across the whole app.</Text>
        <BrandingSwitch label="Enable custom browser tab title" checked={browserTabTitleEnabled} onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setBrowserTabTitleEnabled(e.currentTarget.checked)} />
        <TextInput label="App name (browser tab)" description="Shown as document title on the login page." value={browserTabTitle ?? ''} onChange={(e) => handlers.setBrowserTabTitle(e.currentTarget.value)} disabled={!browserTabTitleEnabled} placeholder="e.g. Atlantisboard" />
        <BrandingSwitch label="Enable custom favicon" checked={faviconEnabled} onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setFaviconEnabled(e.currentTarget.checked)} />
        <Group align="center" wrap="wrap">
          {hasFavicon ? <Box component="img" src={faviconUrl} alt="" w={32} h={32} style={{ objectFit: 'contain' }} /> : null}
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => onFaviconFileChange(e.target.files?.[0] ?? null)}
          />
          <Button variant="light" size="sm" leftSection={<IconUpload size={16} />} onClick={onPickFaviconClick} disabled={!faviconEnabled}>
            {hasFavicon ? 'Replace favicon' : 'Upload favicon'}
          </Button>
          {hasFavicon ? (
            <Button variant="subtle" color="red" size="sm" onClick={onClearFavicon}>Remove</Button>
          ) : null}
        </Group>
      </Stack>
    </Card>
  );
});
