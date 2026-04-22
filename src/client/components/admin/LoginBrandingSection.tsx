import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ChangeEvent,
  type RefObject,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  ColorInput,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  ActionIcon,
  Modal,
} from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { api } from '../../utils/api.js';
import { isAppHostedBrandingAssetUrl } from '../../../shared/brandingAssetUrl.js';
import {
  dispatchLoginBrandingUpdated,
  FONTS_CATALOG_UPDATED_EVENT,
} from '../../appBrandingEvents.js';
import { BrandedLoginCard } from '../auth/BrandedLoginCard.js';
import { BrandingSwitch } from './BrandingSwitch.js';
import {
  DEFAULT_LOGIN_BRANDING_DRAFT,
  getDefaultLoginScreenBrandingForReset,
  LOGIN_LOGO_SIZE_OPTIONS,
  mergePublicLoginBranding,
  type LoginBoxStyle,
  type LoginBrandingDraft,
  type PublicLoginBranding,
} from '../../../shared/types/loginBranding.js';
import {
  buildBrandingFontSelectData,
  stripLegacyBrandingFontStacks,
  type PublicCustomFontEntry,
} from '../../../shared/types/customFonts.js';

const TITLE_SIZE_OPTIONS = ['32', '36', '40', '44', '48', '56'].map((v) => ({
  value: v,
  label: `${v}px`,
}));

const TAGLINE_SIZE_OPTIONS = ['14', '16', '18', '20', '22', '24'].map((v) => ({
  value: v,
  label: `${v}px`,
}));

/** Stable Select `data` references — inline arrays break memoized children every render. */
const BACKGROUND_TYPE_SELECT_DATA = [
  { value: 'solid', label: 'Solid Color' },
  { value: 'gradient', label: 'Gradient' },
] as const;

const LOGIN_BOX_STYLE_SEGMENT_DATA: { value: LoginBoxStyle; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'fullscreen', label: 'Fullscreen' },
];

const LOGO_SIZE_SELECT_DATA = [...LOGIN_LOGO_SIZE_OPTIONS];

const LoginBrandingCardPreview = memo(function LoginBrandingCardPreview({
  branding,
  showLocalForm,
  showGoogle,
}: {
  readonly branding: PublicLoginBranding;
  readonly showLocalForm: boolean;
  readonly showGoogle: boolean;
}) {
  return (
    <BrandedLoginCard
      variant="preview"
      branding={branding}
      showLocalForm={showLocalForm}
      showGoogle={showGoogle}
    />
  );
});

type BrandingHandlers = {
  readonly setBackgroundEnabled: (v: boolean) => void;
  readonly setBackgroundType: (v: string | null) => void;
  readonly setBackgroundColor: (c: string) => void;
  readonly setBackgroundGradientEnd: (c: string) => void;
  readonly setLoginBoxStyle: (v: LoginBoxStyle) => void;
  readonly setLoginBoxBackgroundColor: (c: string) => void;
  readonly setGoogleButtonBackgroundColor: (c: string) => void;
  readonly setGoogleButtonTextColor: (c: string) => void;
  readonly setLoginInputTitleColor: (c: string) => void;
  readonly setLoginLinkTitleColor: (c: string) => void;
  readonly setLoginSignInButtonTextColor: (c: string) => void;
  readonly setLoginSignInButtonColor: (c: string) => void;
  readonly setLogoEnabled: (v: boolean) => void;
  readonly setLogoSizePx: (v: string | null) => void;
  readonly setAppNameEnabled: (v: boolean) => void;
  readonly setAppName: (v: string) => void;
  readonly setAppNameFontFamily: (v: string | null) => void;
  readonly setAppNameFontSizePx: (v: string | null) => void;
  readonly setAppNameColor: (c: string) => void;
  readonly setTaglineEnabled: (v: boolean) => void;
  readonly setTagline: (v: string) => void;
  readonly setTaglineFontFamily: (v: string | null) => void;
  readonly setTaglineFontSizePx: (v: string | null) => void;
  readonly setTaglineColor: (c: string) => void;
  readonly setBrowserTabTitleEnabled: (v: boolean) => void;
  readonly setBrowserTabTitle: (v: string) => void;
  readonly setFaviconEnabled: (v: boolean) => void;
};

const LoginBrandingBackgroundCard = memo(function LoginBrandingBackgroundCard({
  backgroundEnabled,
  backgroundType,
  backgroundColor,
  backgroundGradientEnd,
  handlers,
}: {
  readonly backgroundEnabled: boolean;
  readonly backgroundType: 'solid' | 'gradient';
  readonly backgroundColor: string;
  readonly backgroundGradientEnd: string;
  readonly handlers: BrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Custom Login Background</Title>
        <BrandingSwitch
          label="Enable custom background"
          checked={backgroundEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setBackgroundEnabled(e.currentTarget.checked)
          }
        />
        <Select
          label="Background Type"
          data={BACKGROUND_TYPE_SELECT_DATA}
          value={backgroundType}
          onChange={handlers.setBackgroundType}
          disabled={!backgroundEnabled}
        />
        <ColorInput
          label="Background Color"
          value={backgroundColor}
          onChange={handlers.setBackgroundColor}
          disabled={!backgroundEnabled}
        />
        {backgroundType === 'gradient' ? (
          <ColorInput
            label="Gradient end color"
            value={backgroundGradientEnd}
            onChange={handlers.setBackgroundGradientEnd}
            disabled={!backgroundEnabled}
          />
        ) : null}
      </Stack>
    </Card>
  );
});

const LoginBrandingLoginBoxStyleCard = memo(function LoginBrandingLoginBoxStyleCard({
  loginBoxStyle,
  handlers,
}: {
  readonly loginBoxStyle: LoginBoxStyle;
  readonly handlers: BrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Login Box Style</Title>
        <Text size="sm" c="dimmed">
          Box keeps the sign-in card on your custom background. Fullscreen uses the page background
          edge-to-edge without a separate card panel.
        </Text>
        <SegmentedControl
          fullWidth
          value={loginBoxStyle}
          onChange={(v) => handlers.setLoginBoxStyle(v === 'fullscreen' ? 'fullscreen' : 'box')}
          data={LOGIN_BOX_STYLE_SEGMENT_DATA}
        />
      </Stack>
    </Card>
  );
});

const LoginBrandingLoginBoxCard = memo(function LoginBrandingLoginBoxCard({
  loginBoxBackgroundColor,
  googleButtonBackgroundColor,
  googleButtonTextColor,
  loginInputTitleColor,
  loginLinkTitleColor,
  loginSignInButtonTextColor,
  loginSignInButtonColor,
  handlers,
}: {
  readonly loginBoxBackgroundColor: string;
  readonly googleButtonBackgroundColor: string;
  readonly googleButtonTextColor: string;
  readonly loginInputTitleColor: string;
  readonly loginLinkTitleColor: string;
  readonly loginSignInButtonTextColor: string;
  readonly loginSignInButtonColor: string;
  readonly handlers: BrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Login Box &amp; Button Styling</Title>
        <ColorInput
          label="Login Box Background"
          value={loginBoxBackgroundColor}
          onChange={handlers.setLoginBoxBackgroundColor}
        />
        <ColorInput
          label="Google Button Background"
          value={googleButtonBackgroundColor}
          onChange={handlers.setGoogleButtonBackgroundColor}
        />
        <ColorInput
          label="Input Title Colour"
          description="Email, password, Remember me, and “Don’t have an account?” text"
          value={loginInputTitleColor}
          onChange={handlers.setLoginInputTitleColor}
        />
        <ColorInput
          label="Link Title Colour"
          description="Forgot password and Sign up links"
          value={loginLinkTitleColor}
          onChange={handlers.setLoginLinkTitleColor}
        />
        <ColorInput
          label="Sign in Button text colour"
          value={loginSignInButtonTextColor}
          onChange={handlers.setLoginSignInButtonTextColor}
        />
        <ColorInput
          label="Sign in Button colour"
          value={loginSignInButtonColor}
          onChange={handlers.setLoginSignInButtonColor}
        />
        <ColorInput
          label="Google Button Text Color"
          value={googleButtonTextColor}
          onChange={handlers.setGoogleButtonTextColor}
        />
      </Stack>
    </Card>
  );
});

const LoginBrandingLogoCard = memo(function LoginBrandingLogoCard({
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
          <Text size="sm" c="dimmed" mt={4}>
            Display a custom logo on the sign-in screen.
          </Text>
        </div>
        <BrandingSwitch
          label="Enable custom logo"
          checked={logoEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setLogoEnabled(e.currentTarget.checked)
          }
        />
        <Text fw={500} size="sm">
          Logo Image
        </Text>
        <Group align="flex-end" wrap="wrap">
          {hasUploadedLogo ? (
            <Box pos="relative" style={{ width: 96, height: 96 }}>
              <Box
                component="img"
                src={logo}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--mantine-color-gray-3)',
                }}
              />
              <ActionIcon
                color="red"
                variant="filled"
                size="sm"
                radius="xl"
                pos="absolute"
                top={4}
                right={4}
                aria-label="Remove logo"
                onClick={onClearLogo}
              >
                <IconX size={14} />
              </ActionIcon>
            </Box>
          ) : (
            <Box
              w={96}
              h={96}
              style={{
                border: '1px dashed var(--mantine-color-gray-4)',
                borderRadius: 8,
                background: 'var(--mantine-color-gray-0)',
              }}
            />
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
        <Select
          label="Logo Size"
          data={LOGO_SIZE_SELECT_DATA}
          value={String(logoSizePx)}
          onChange={handlers.setLogoSizePx}
        />
      </Stack>
    </Card>
  );
});

const LoginBrandingAppNameCard = memo(function LoginBrandingAppNameCard({
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
                <Text size="sm" c="dimmed" mt={4}>
                  Shown on the sign-in screen and the home navigation after you save.
                </Text>
        </div>
        <BrandingSwitch
          label="Enable custom app name"
          checked={appNameEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setAppNameEnabled(e.currentTarget.checked)
          }
        />
        <TextInput
          label="Application Name"
          value={appName ?? ''}
          onChange={(e) => handlers.setAppName(e.currentTarget.value)}
          disabled={!appNameEnabled}
        />
        <Select
          label="Font"
          data={fontSelectData}
          value={appNameFontFamily}
          onChange={handlers.setAppNameFontFamily}
          disabled={!appNameEnabled}
        />
        <Text size="xs" c="dimmed">
          Add fonts under Customisation → Custom fonts. Only System UI and uploaded fonts appear here.
        </Text>
        <Group grow align="flex-end">
          <Select
            label="Size & Color"
            data={TITLE_SIZE_OPTIONS}
            value={String(appNameFontSizePx)}
            onChange={handlers.setAppNameFontSizePx}
            disabled={!appNameEnabled}
          />
          <ColorInput
            label=" "
            value={appNameColor}
            onChange={handlers.setAppNameColor}
            disabled={!appNameEnabled}
          />
        </Group>
      </Stack>
    </Card>
  );
});

const LoginBrandingTaglineCard = memo(function LoginBrandingTaglineCard({
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
          <Text size="sm" c="dimmed" mt={4}>
            Display a custom tagline below the app name.
          </Text>
        </div>
        <BrandingSwitch
          label="Enable custom tagline"
          checked={taglineEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setTaglineEnabled(e.currentTarget.checked)
          }
        />
        <TextInput
          label="Tagline Text"
          value={tagline ?? ''}
          onChange={(e) => handlers.setTagline(e.currentTarget.value)}
          disabled={!taglineEnabled}
        />
        <Select
          label="Font"
          data={fontSelectData}
          value={taglineFontFamily}
          onChange={handlers.setTaglineFontFamily}
          disabled={!taglineEnabled}
        />
        <Text size="xs" c="dimmed">
          Same font list as app name (Customisation → Custom fonts).
        </Text>
        <Group grow align="flex-end">
          <Select
            label="Size & Color"
            data={TAGLINE_SIZE_OPTIONS}
            value={String(taglineFontSizePx)}
            onChange={handlers.setTaglineFontSizePx}
            disabled={!taglineEnabled}
          />
          <ColorInput
            label=" "
            value={taglineColor}
            onChange={handlers.setTaglineColor}
            disabled={!taglineEnabled}
          />
        </Group>
      </Stack>
    </Card>
  );
});

const LoginBrandingBrowserTabCard = memo(function LoginBrandingBrowserTabCard({
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
        <Text size="sm" c="dimmed">
          After you save, the tab title and favicon apply across the whole app.
        </Text>
        <BrandingSwitch
          label="Enable custom browser tab title"
          checked={browserTabTitleEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setBrowserTabTitleEnabled(e.currentTarget.checked)
          }
        />
        <TextInput
          label="App name (browser tab)"
          description="Shown as document title on the login page."
          value={browserTabTitle ?? ''}
          onChange={(e) => handlers.setBrowserTabTitle(e.currentTarget.value)}
          disabled={!browserTabTitleEnabled}
          placeholder="e.g. Atlantisboard"
        />
        <BrandingSwitch
          label="Enable custom favicon"
          checked={faviconEnabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setFaviconEnabled(e.currentTarget.checked)
          }
        />
        <Group align="center" wrap="wrap">
          {hasFavicon ? (
            <Box
              component="img"
              src={faviconUrl}
              alt=""
              w={32}
              h={32}
              style={{ objectFit: 'contain' }}
            />
          ) : null}
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => onFaviconFileChange(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="light"
            size="sm"
            leftSection={<IconUpload size={16} />}
            onClick={onPickFaviconClick}
            disabled={!faviconEnabled}
          >
            {hasFavicon ? 'Replace favicon' : 'Upload favicon'}
          </Button>
          {hasFavicon ? (
            <Button variant="subtle" color="red" size="sm" onClick={onClearFavicon}>
              Remove
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Card>
  );
});

const LoginBrandingPreviewPane = memo(function LoginBrandingPreviewPane({
  previewBranding,
  showLocalForm,
  showGoogle,
}: {
  readonly previewBranding: PublicLoginBranding;
  readonly showLocalForm: boolean;
  readonly showGoogle: boolean;
}) {
  return (
    <Box>
      <Text fw={600} size="sm" mb="sm">
        Live Preview
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Same components as the real login page (read-only). Updates shortly after you stop typing.
      </Text>
      <Box
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'visible',
          background: 'var(--mantine-color-gray-1)',
        }}
      >
        <LoginBrandingCardPreview
          branding={previewBranding}
          showLocalForm={showLocalForm}
          showGoogle={showGoogle}
        />
      </Box>
    </Box>
  );
});

function migrateLegacyBranding(
  lb: Record<string, unknown> | undefined,
  draft: LoginBrandingDraft
): LoginBrandingDraft {
  const next = { ...draft };
  if (typeof lb?.appName === 'string' && lb.appName.length > 0 && lb.appNameEnabled === undefined) {
    next.appNameEnabled = true;
  }
  if (typeof lb?.logo === 'string' && lb.logo.length > 0 && lb.logoEnabled === undefined) {
    next.logoEnabled = true;
  }
  if (typeof lb?.tagline === 'string' && lb.tagline.length > 0 && lb.taglineEnabled === undefined) {
    next.taglineEnabled = true;
  }
  next.appNameFontFamily = stripLegacyBrandingFontStacks(next.appNameFontFamily);
  next.taglineFontFamily = stripLegacyBrandingFontStacks(next.taglineFontFamily);
  return next;
}

function LoginBrandingSectionInner() {
  const [draft, setDraft] = useState<LoginBrandingDraft>(DEFAULT_LOGIN_BRANDING_DRAFT);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetModalOpened, { open: openResetModal, close: closeResetModal }] = useDisclosure(false);
  const [loginPreviewOpts, setLoginPreviewOpts] = useState<{
    emailPassword: boolean;
    googleLogin: boolean;
  }>({ emailPassword: true, googleLogin: false });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);
  const successClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const scheduleSuccessMessageClear = useCallback((): void => {
    if (successClearTimeoutRef.current !== null) {
      clearTimeout(successClearTimeoutRef.current);
    }
    successClearTimeoutRef.current = setTimeout(() => {
      successClearTimeoutRef.current = null;
      if (isMounted.current) {
        setSuccess(null);
      }
    }, 3000);
  }, []);

  const [customFonts, setCustomFonts] = useState<PublicCustomFontEntry[]>([]);

  const reloadCustomFonts = useCallback(async () => {
    try {
      const { fonts } = await api.getFontsCatalog();
      if (isMounted.current) {
        setCustomFonts(fonts);
      }
    } catch {
      if (isMounted.current) {
        setCustomFonts([]);
      }
    }
  }, []);

  const [debouncedDraft] = useDebouncedValue(draft, 500);
  const previewBranding = useMemo(
    () => mergePublicLoginBranding(debouncedDraft) as unknown as PublicLoginBranding,
    [debouncedDraft]
  );

  const fontSelectData = useMemo(
    () => buildBrandingFontSelectData(customFonts),
    [customFonts]
  );

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
    []
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
      if (isMounted.current) {
        setPageLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();
    return () => {
      isMounted.current = false;
      if (successClearTimeoutRef.current !== null) {
        clearTimeout(successClearTimeoutRef.current);
        successClearTimeoutRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    void reloadCustomFonts();
  }, [reloadCustomFonts]);

  useEffect(() => {
    const onFonts = (): void => {
      void reloadCustomFonts();
    };
    window.addEventListener(FONTS_CATALOG_UPDATED_EVENT, onFonts);
    return () => window.removeEventListener(FONTS_CATALOG_UPDATED_EVENT, onFonts);
  }, [reloadCustomFonts]);

  useEffect(() => {
    void api
      .getLoginOptions()
      .then((o) => {
        if (isMounted.current) {
          setLoginPreviewOpts({ emailPassword: o.emailPassword, googleLogin: o.googleLogin });
        }
      })
      .catch(() => {
        /* defaults */
      });
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

  const handleConfirmResetDefaults = useCallback(async () => {
    const logoU = draftRef.current.logo?.trim() ?? '';
    const favU = draftRef.current.faviconUrl?.trim() ?? '';
    try {
      setResetting(true);
      setError(null);
      await api.updateAdminConfig({
        loginScreenBranding: getDefaultLoginScreenBrandingForReset(),
      });
      const deleteFailures: string[] = [];
      if (logoU && isAppHostedBrandingAssetUrl(logoU)) {
        try {
          await api.deleteBrandingFile(logoU);
        } catch {
          deleteFailures.push('logo file');
        }
      }
      if (favU && isAppHostedBrandingAssetUrl(favU)) {
        try {
          await api.deleteBrandingFile(favU);
        } catch {
          deleteFailures.push('favicon file');
        }
      }
      setDraft({ ...DEFAULT_LOGIN_BRANDING_DRAFT });
      const li = logoInputRef.current;
      const fi = faviconInputRef.current;
      if (li) {
        li.value = '';
      }
      if (fi) {
        fi.value = '';
      }
      dispatchLoginBrandingUpdated();
      closeResetModal();
      if (deleteFailures.length > 0) {
        setSuccess(null);
        setError(
          `Defaults were saved, but storage could not remove: ${deleteFailures.join(', ')}.`
        );
      } else {
        setSuccess('Login branding reset to defaults');
        scheduleSuccessMessageClear();
      }
    } catch (e) {
      console.error(e);
      setError('Failed to reset login branding');
    } finally {
      setResetting(false);
    }
  }, [closeResetModal, scheduleSuccessMessageClear]);

  const uploadFile = useCallback(async (file: File | null, kind: 'logo' | 'favicon') => {
    if (!file) {
      return;
    }
    try {
      setError(null);
      const prev =
        kind === 'logo'
          ? draftRef.current.logo?.trim()
          : draftRef.current.faviconUrl?.trim();
      if (prev && isAppHostedBrandingAssetUrl(prev)) {
        try {
          await api.deleteBrandingFile(prev);
        } catch {
          /* best-effort cleanup before replace */
        }
      }
      const { url } = await api.uploadBrandingFile(file, kind);
      if (kind === 'logo') {
        setDraft((d) => ({ ...d, logo: url, logoEnabled: true }));
      } else {
        setDraft((d) => ({ ...d, faviconUrl: url, faviconEnabled: true }));
      }
    } catch (e) {
      console.error(e);
      setError(kind === 'logo' ? 'Logo upload failed' : 'Favicon upload failed');
    }
  }, []);

  const onLogoFileChange = useCallback(
    (file: File | null) => {
      void uploadFile(file, 'logo').finally(() => {
        const el = logoInputRef.current;
        if (el) {
          el.value = '';
        }
      });
    },
    [uploadFile]
  );

  const onFaviconFileChange = useCallback(
    (file: File | null) => {
      void uploadFile(file, 'favicon').finally(() => {
        const el = faviconInputRef.current;
        if (el) {
          el.value = '';
        }
      });
    },
    [uploadFile]
  );

  const handleClearLogo = useCallback(() => {
    void (async () => {
      const url = draftRef.current.logo?.trim();
      if (url && isAppHostedBrandingAssetUrl(url)) {
        try {
          await api.deleteBrandingFile(url);
        } catch (e) {
          console.error(e);
          setError('Failed to remove logo file from storage');
          return;
        }
      }
      setDraft((d) => ({ ...d, logo: '' }));
      const el = logoInputRef.current;
      if (el) {
        el.value = '';
      }
    })();
  }, []);

  const handleClearFavicon = useCallback(() => {
    void (async () => {
      const url = draftRef.current.faviconUrl?.trim();
      if (url && isAppHostedBrandingAssetUrl(url)) {
        try {
          await api.deleteBrandingFile(url);
        } catch (e) {
          console.error(e);
          setError('Failed to remove favicon file from storage');
          return;
        }
      }
      setDraft((d) => ({ ...d, faviconUrl: '' }));
      const el = faviconInputRef.current;
      if (el) {
        el.value = '';
      }
    })();
  }, []);

  const onPickLogoClick = useCallback(() => {
    const el = logoInputRef.current;
    if (el) {
      el.value = '';
      el.click();
    }
  }, []);

  const onPickFaviconClick = useCallback(() => {
    const el = faviconInputRef.current;
    if (el) {
      el.value = '';
      el.click();
    }
  }, []);

  if (pageLoading) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack gap="lg">
      <Modal
        opened={resetModalOpened}
        onClose={resetting ? () => undefined : closeResetModal}
        title="Reset login branding to defaults?"
        centered
        closeOnClickOutside={!resetting}
        closeOnEscape={!resetting}
        closeButtonProps={{ disabled: resetting }}
      >
        <Stack gap="md">
          <Text size="sm">
            This will remove all custom login screen settings, clear custom logo and favicon from the
            admin UI, save factory defaults to the server, and delete uploaded logo and favicon files
            from storage when they are hosted on this app. This cannot be undone from here.
          </Text>
          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" onClick={closeResetModal} disabled={resetting}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleConfirmResetDefaults()} loading={resetting}>
              Yes, reset everything
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={3}>Login Branding</Title>
          <Text size="sm" c="dimmed" maw={520} mt="xs">
            Customize the appearance of the login screen.
          </Text>
        </Box>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button
            variant="default"
            color="gray"
            onClick={openResetModal}
            disabled={saving || resetting}
          >
            Reset defaults
          </Button>
          <Button
            color="blue"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={resetting}
          >
            Save Changes
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}

      <SimpleGrid
        cols={{ base: 1, lg: 2 }}
        spacing="lg"
        style={{ alignItems: 'flex-start' }}
      >
        <Stack gap="md">
          <LoginBrandingBackgroundCard
            backgroundEnabled={draft.backgroundEnabled}
            backgroundType={draft.backgroundType}
            backgroundColor={draft.backgroundColor}
            backgroundGradientEnd={draft.backgroundGradientEnd}
            handlers={handlers}
          />
          <LoginBrandingLoginBoxStyleCard
            loginBoxStyle={draft.loginBoxStyle}
            handlers={handlers}
          />
          <LoginBrandingLoginBoxCard
            loginBoxBackgroundColor={draft.loginBoxBackgroundColor}
            googleButtonBackgroundColor={draft.googleButtonBackgroundColor}
            googleButtonTextColor={draft.googleButtonTextColor}
            loginInputTitleColor={draft.loginInputTitleColor}
            loginLinkTitleColor={draft.loginLinkTitleColor}
            loginSignInButtonTextColor={draft.loginSignInButtonTextColor}
            loginSignInButtonColor={draft.loginSignInButtonColor}
            handlers={handlers}
          />
          <LoginBrandingLogoCard
            logoEnabled={draft.logoEnabled}
            logo={draft.logo}
            logoSizePx={draft.logoSizePx}
            handlers={handlers}
            logoInputRef={logoInputRef}
            onLogoFileChange={onLogoFileChange}
            onPickLogoClick={onPickLogoClick}
            onClearLogo={handleClearLogo}
          />
          <LoginBrandingAppNameCard
            appNameEnabled={draft.appNameEnabled}
            appName={draft.appName}
            appNameFontFamily={draft.appNameFontFamily}
            appNameFontSizePx={draft.appNameFontSizePx}
            appNameColor={draft.appNameColor}
            fontSelectData={fontSelectData}
            handlers={handlers}
          />
          <LoginBrandingTaglineCard
            taglineEnabled={draft.taglineEnabled}
            tagline={draft.tagline}
            taglineFontFamily={draft.taglineFontFamily}
            taglineFontSizePx={draft.taglineFontSizePx}
            taglineColor={draft.taglineColor}
            fontSelectData={fontSelectData}
            handlers={handlers}
          />
          <LoginBrandingBrowserTabCard
            browserTabTitleEnabled={draft.browserTabTitleEnabled}
            browserTabTitle={draft.browserTabTitle}
            faviconEnabled={draft.faviconEnabled}
            faviconUrl={draft.faviconUrl}
            handlers={handlers}
            faviconInputRef={faviconInputRef}
            onFaviconFileChange={onFaviconFileChange}
            onPickFaviconClick={onPickFaviconClick}
            onClearFavicon={handleClearFavicon}
          />
        </Stack>

        <Box
          style={{
            position: 'sticky',
            top: 'var(--mantine-spacing-md)',
            alignSelf: 'flex-start',
            minWidth: 0,
          }}
        >
          <LoginBrandingPreviewPane
            previewBranding={previewBranding}
            showLocalForm={loginPreviewOpts.emailPassword}
            showGoogle={loginPreviewOpts.googleLogin}
          />
        </Box>
      </SimpleGrid>
    </Stack>
  );
}

export const LoginBrandingSection = memo(LoginBrandingSectionInner);
