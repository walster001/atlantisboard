import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Group, Loader, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { api } from '../../utils/api.js';
import { isAppHostedBrandingAssetUrl } from '../../../shared/brandingAssetUrl.js';
import { dispatchLoginBrandingUpdated, FONTS_CATALOG_UPDATED_EVENT, LOGIN_OPTIONS_UPDATED_EVENT } from '../../appBrandingEvents.js';
import {
  DEFAULT_LOGIN_BRANDING_DRAFT,
  getDefaultLoginScreenBrandingForReset,
  mergePublicLoginBranding,
  type LoginBrandingDraft,
  type PublicLoginBranding,
} from '../../../shared/types/loginBranding.js';
import { toPublicLoginBranding } from '../../utils/brandingPublicTypes.js';
import { buildBrandingFontSelectData, type PublicCustomFontEntry } from '../../../shared/types/customFonts.js';
import {
  LoginBrandingBackgroundCard,
  LoginBrandingLoginBoxCard,
  LoginBrandingLoginBoxStyleCard,
  LoginBrandingPreviewPane,
} from './LoginBrandingSection/cardsLayout.js';
import {
  LoginBrandingAppNameCard,
  LoginBrandingBrowserTabCard,
  LoginBrandingLogoCard,
  LoginBrandingTaglineCard,
} from './LoginBrandingSection/cardsIdentity.js';
import { migrateLegacyBranding } from './LoginBrandingSection/migration.js';
import type { BrandingHandlers } from './LoginBrandingSection/types.js';

function LoginBrandingSectionInner() {
  const [draft, setDraft] = useState<LoginBrandingDraft>(DEFAULT_LOGIN_BRANDING_DRAFT);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetModalOpened, { open: openResetModal, close: closeResetModal }] = useDisclosure(false);
  const [loginPreviewOpts, setLoginPreviewOpts] = useState({ emailPassword: true, googleLogin: false });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);
  const successClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const [customFonts, setCustomFonts] = useState<PublicCustomFontEntry[]>([]);
  draftRef.current = draft;

  const scheduleSuccessMessageClear = useCallback((): void => {
    if (successClearTimeoutRef.current !== null) clearTimeout(successClearTimeoutRef.current);
    successClearTimeoutRef.current = setTimeout(() => {
      successClearTimeoutRef.current = null;
      if (isMounted.current) setSuccess(null);
    }, 3000);
  }, []);

  const reloadCustomFonts = useCallback(async () => {
    try {
      const { fonts } = await api.getFontsCatalog();
      if (isMounted.current) setCustomFonts(fonts);
    } catch {
      if (isMounted.current) setCustomFonts([]);
    }
  }, []);

  const [debouncedDraft] = useDebouncedValue(draft, 500);
  const previewBranding = useMemo(
    () => toPublicLoginBranding(debouncedDraft),
    [debouncedDraft],
  );
  const fontSelectData = useMemo(() => buildBrandingFontSelectData(customFonts), [customFonts]);

  const handlers = useMemo(
    (): BrandingHandlers => ({
      setBackgroundEnabled: (v) => setDraft((d) => ({ ...d, backgroundEnabled: v })),
      setBackgroundType: (v) =>
        setDraft((d) => ({ ...d, backgroundType: v === 'gradient' ? 'gradient' : 'solid' })),
      setBackgroundColor: (c) => setDraft((d) => ({ ...d, backgroundColor: c })),
      setBackgroundGradientEnd: (c) => setDraft((d) => ({ ...d, backgroundGradientEnd: c })),
      setLoginBoxStyle: (v) => setDraft((d) => ({ ...d, loginBoxStyle: v })),
      setLoginBoxBackgroundColor: (c) => setDraft((d) => ({ ...d, loginBoxBackgroundColor: c })),
      setGoogleButtonBackgroundColor: (c) =>
        setDraft((d) => ({ ...d, googleButtonBackgroundColor: c })),
      setGoogleButtonTextColor: (c) => setDraft((d) => ({ ...d, googleButtonTextColor: c })),
      setLoginInputTitleColor: (c) => setDraft((d) => ({ ...d, loginInputTitleColor: c })),
      setLoginLinkTitleColor: (c) => setDraft((d) => ({ ...d, loginLinkTitleColor: c })),
      setLoginSignInButtonTextColor: (c) =>
        setDraft((d) => ({ ...d, loginSignInButtonTextColor: c })),
      setLoginSignInButtonColor: (c) => setDraft((d) => ({ ...d, loginSignInButtonColor: c })),
      setLogoEnabled: (v) => setDraft((d) => ({ ...d, logoEnabled: v })),
      setLogoSizePx: (v) => setDraft((d) => ({ ...d, logoSizePx: Number(v) || 300 })),
      setAppNameEnabled: (v) => setDraft((d) => ({ ...d, appNameEnabled: v })),
      setAppName: (v) => setDraft((d) => ({ ...d, appName: v })),
      setAppNameFontFamily: (v) =>
        setDraft((d) => ({ ...d, appNameFontFamily: v ?? d.appNameFontFamily })),
      setAppNameFontSizePx: (v) => setDraft((d) => ({ ...d, appNameFontSizePx: Number(v) || 44 })),
      setAppNameColor: (c) => setDraft((d) => ({ ...d, appNameColor: c })),
      setTaglineEnabled: (v) => setDraft((d) => ({ ...d, taglineEnabled: v })),
      setTagline: (v) => setDraft((d) => ({ ...d, tagline: v })),
      setTaglineFontFamily: (v) =>
        setDraft((d) => ({ ...d, taglineFontFamily: v ?? d.taglineFontFamily })),
      setTaglineFontSizePx: (v) => setDraft((d) => ({ ...d, taglineFontSizePx: Number(v) || 20 })),
      setTaglineColor: (c) => setDraft((d) => ({ ...d, taglineColor: c })),
      setBrowserTabTitleEnabled: (v) => setDraft((d) => ({ ...d, browserTabTitleEnabled: v })),
      setBrowserTabTitle: (v) => setDraft((d) => ({ ...d, browserTabTitle: v })),
      setFaviconEnabled: (v) => setDraft((d) => ({ ...d, faviconEnabled: v })),
    }),
    [],
  );

  const load = useCallback(async () => {
    try {
      setPageLoading(true);
      setError(null);
      const { config } = await api.getAdminConfig();
      const lb = (config as { loginScreenBranding?: Record<string, unknown> }).loginScreenBranding;
      const merged = mergePublicLoginBranding(lb as Partial<PublicLoginBranding>);
      setDraft(migrateLegacyBranding(lb, merged));
    } catch (e) {
      console.error(e);
      setError('Failed to load branding settings');
    } finally {
      if (isMounted.current) setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();
    return () => {
      isMounted.current = false;
      if (successClearTimeoutRef.current !== null) clearTimeout(successClearTimeoutRef.current);
    };
  }, [load]);

  useEffect(() => {
    void reloadCustomFonts();
  }, [reloadCustomFonts]);

  useEffect(() => {
    const onFonts = (): void => void reloadCustomFonts();
    window.addEventListener(FONTS_CATALOG_UPDATED_EVENT, onFonts);
    return () => window.removeEventListener(FONTS_CATALOG_UPDATED_EVENT, onFonts);
  }, [reloadCustomFonts]);

  useEffect(() => {
    const fetchLoginOpts = () => {
      void api
        .getLoginOptions()
        .then((opts) => {
          if (isMounted.current) setLoginPreviewOpts({ emailPassword: opts.emailPassword, googleLogin: opts.googleLogin });
        })
        .catch(() => undefined);
    };
    fetchLoginOpts();
    window.addEventListener(LOGIN_OPTIONS_UPDATED_EVENT, fetchLoginOpts);
    return () => window.removeEventListener(LOGIN_OPTIONS_UPDATED_EVENT, fetchLoginOpts);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updateAdminConfig({ loginScreenBranding: draftRef.current });
      dispatchLoginBrandingUpdated();
      setSuccess('Changes saved');
      scheduleSuccessMessageClear();
    } catch (e) {
      console.error(e);
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [scheduleSuccessMessageClear]);

  const uploadFile = useCallback(async (file: File | null, kind: 'logo' | 'favicon') => {
    if (!file) return;
    try {
      setError(null);
      const previous = kind === 'logo' ? draftRef.current.logo?.trim() : draftRef.current.faviconUrl?.trim();
      if (previous && isAppHostedBrandingAssetUrl(previous)) {
        try {
          await api.deleteBrandingFile(previous);
        } catch {
          // best effort delete
        }
      }
      const { url } = await api.uploadBrandingFile(file, kind);
      if (kind === 'logo') setDraft((d) => ({ ...d, logo: url, logoEnabled: true }));
      else setDraft((d) => ({ ...d, faviconUrl: url, faviconEnabled: true }));
    } catch (e) {
      console.error(e);
      setError(kind === 'logo' ? 'Logo upload failed' : 'Favicon upload failed');
    }
  }, []);

  const onLogoFileChange = useCallback((file: File | null) => {
    void uploadFile(file, 'logo').finally(() => {
      const input = logoInputRef.current;
      if (input) input.value = '';
    });
  }, [uploadFile]);

  const onFaviconFileChange = useCallback((file: File | null) => {
    void uploadFile(file, 'favicon').finally(() => {
      const input = faviconInputRef.current;
      if (input) input.value = '';
    });
  }, [uploadFile]);

  const clearHostedAsset = useCallback(async (kind: 'logo' | 'favicon') => {
    const url = kind === 'logo' ? draftRef.current.logo?.trim() : draftRef.current.faviconUrl?.trim();
    if (url && isAppHostedBrandingAssetUrl(url)) {
      try {
        await api.deleteBrandingFile(url);
      } catch (e) {
        console.error(e);
        setError(`Failed to remove ${kind} file from storage`);
        return;
      }
    }
    if (kind === 'logo') {
      setDraft((d) => ({ ...d, logo: '' }));
      const input = logoInputRef.current;
      if (input) input.value = '';
    } else {
      setDraft((d) => ({ ...d, faviconUrl: '' }));
      const input = faviconInputRef.current;
      if (input) input.value = '';
    }
  }, []);

  if (pageLoading) {
    return <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}><Loader /></Box>;
  }

  return (
    <Stack gap="lg">
      <Modal opened={resetModalOpened} onClose={resetting ? () => undefined : closeResetModal} title="Reset login branding to defaults?" centered closeOnClickOutside={!resetting} closeOnEscape={!resetting} closeButtonProps={{ disabled: resetting }}>
        <Stack gap="md">
          <Text size="sm">This will remove all custom login screen settings and delete app-hosted logo/favicon files.</Text>
          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" onClick={closeResetModal} disabled={resetting}>Cancel</Button>
            <Button color="red" onClick={() => void (async () => {
              const logoUrl = draftRef.current.logo?.trim() ?? '';
              const faviconUrl = draftRef.current.faviconUrl?.trim() ?? '';
              try {
                setResetting(true);
                setError(null);
                await api.updateAdminConfig({ loginScreenBranding: getDefaultLoginScreenBrandingForReset() });
                if (logoUrl && isAppHostedBrandingAssetUrl(logoUrl)) await api.deleteBrandingFile(logoUrl).catch(() => undefined);
                if (faviconUrl && isAppHostedBrandingAssetUrl(faviconUrl)) await api.deleteBrandingFile(faviconUrl).catch(() => undefined);
                setDraft({ ...DEFAULT_LOGIN_BRANDING_DRAFT });
                dispatchLoginBrandingUpdated();
                closeResetModal();
                setSuccess('Login branding reset to defaults');
                scheduleSuccessMessageClear();
              } catch (e) {
                console.error(e);
                setError('Failed to reset login branding');
              } finally {
                setResetting(false);
              }
            })()} loading={resetting}>
              Yes, reset everything
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box><Title order={3}>Login Branding</Title><Text size="sm" c="dimmed" maw={520} mt="xs">Customize the appearance of the login screen.</Text></Box>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button variant="default" color="gray" onClick={openResetModal} disabled={saving || resetting}>Reset defaults</Button>
          <Button color="blue" onClick={() => void handleSave()} loading={saving} disabled={resetting}>Save Changes</Button>
        </Group>
      </Group>

      {error ? <Alert color="red" withCloseButton onClose={() => setError(null)}>{error}</Alert> : null}
      {success ? <Alert color="green">{success}</Alert> : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'flex-start' }}>
        <Stack gap="md">
          <LoginBrandingBackgroundCard backgroundEnabled={draft.backgroundEnabled} backgroundType={draft.backgroundType} backgroundColor={draft.backgroundColor} backgroundGradientEnd={draft.backgroundGradientEnd} handlers={handlers} />
          <LoginBrandingLoginBoxStyleCard loginBoxStyle={draft.loginBoxStyle} handlers={handlers} />
          <LoginBrandingLoginBoxCard loginBoxBackgroundColor={draft.loginBoxBackgroundColor} googleButtonBackgroundColor={draft.googleButtonBackgroundColor} googleButtonTextColor={draft.googleButtonTextColor} loginInputTitleColor={draft.loginInputTitleColor} loginLinkTitleColor={draft.loginLinkTitleColor} loginSignInButtonTextColor={draft.loginSignInButtonTextColor} loginSignInButtonColor={draft.loginSignInButtonColor} handlers={handlers} />
          <LoginBrandingLogoCard logoEnabled={draft.logoEnabled} logo={draft.logo} logoSizePx={draft.logoSizePx} handlers={handlers} logoInputRef={logoInputRef} onLogoFileChange={onLogoFileChange} onPickLogoClick={() => { const input = logoInputRef.current; if (input) { input.value = ''; input.click(); } }} onClearLogo={() => void clearHostedAsset('logo')} />
          <LoginBrandingAppNameCard appNameEnabled={draft.appNameEnabled} appName={draft.appName} appNameFontFamily={draft.appNameFontFamily} appNameFontSizePx={draft.appNameFontSizePx} appNameColor={draft.appNameColor} fontSelectData={fontSelectData} handlers={handlers} />
          <LoginBrandingTaglineCard taglineEnabled={draft.taglineEnabled} tagline={draft.tagline} taglineFontFamily={draft.taglineFontFamily} taglineFontSizePx={draft.taglineFontSizePx} taglineColor={draft.taglineColor} fontSelectData={fontSelectData} handlers={handlers} />
          <LoginBrandingBrowserTabCard browserTabTitleEnabled={draft.browserTabTitleEnabled} browserTabTitle={draft.browserTabTitle} faviconEnabled={draft.faviconEnabled} faviconUrl={draft.faviconUrl} handlers={handlers} faviconInputRef={faviconInputRef} onFaviconFileChange={onFaviconFileChange} onPickFaviconClick={() => { const input = faviconInputRef.current; if (input) { input.value = ''; input.click(); } }} onClearFavicon={() => void clearHostedAsset('favicon')} />
        </Stack>
        <Box style={{ position: 'sticky', top: 'var(--mantine-spacing-md)', alignSelf: 'flex-start', minWidth: 0 }}>
          <LoginBrandingPreviewPane previewBranding={previewBranding} showLocalForm={loginPreviewOpts.emailPassword} showGoogle={loginPreviewOpts.googleLogin} />
        </Box>
      </SimpleGrid>
    </Stack>
  );
}

export const LoginBrandingSection = memo(LoginBrandingSectionInner);
