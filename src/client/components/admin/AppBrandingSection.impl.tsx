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
  Checkbox,
  ColorInput,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  ActionIcon,
} from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { api } from '../../utils/api.js';
import { isAppHostedBrandingAssetUrl } from '../../../shared/brandingAssetUrl.js';
import {
  dispatchAppBrandingUpdated,
  LOGIN_BRANDING_UPDATED_EVENT,
} from '../../appBrandingEvents.js';
import {
  APP_NAVBAR_ICON_SIZE_MAX_PX,
  APP_NAVBAR_ICON_SIZE_MIN_PX,
  DEFAULT_APP_BRANDING_DRAFT,
  DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX,
  DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX,
  clampAppNavbarIconSizePx,
  getDefaultAppScreenBrandingForReset,
  mergePublicAppBranding,
  type AppBrandingDraft,
  type HomepageBackgroundMode,
  type PublicAppBranding,
} from '../../../shared/types/appBranding.js';
import { mergePublicLoginBranding, type PublicLoginBranding } from '../../../shared/types/loginBranding.js';
import { AppBrandingPreviewPane } from './AppBrandingPreviewPane.js';
import { resizeImageForBackgroundUpload } from '../../utils/resizeImageForBackgroundUpload.js';

const BG_MODE_SEGMENTS: { value: HomepageBackgroundMode; label: string }[] = [
  { value: 'color', label: 'Background color' },
  { value: 'image', label: 'Background image' },
];

const NAV_ICON_SIZE_SELECT_DATA: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let px = APP_NAVBAR_ICON_SIZE_MIN_PX; px <= APP_NAVBAR_ICON_SIZE_MAX_PX; px += 1) {
    out.push({ value: String(px), label: `${px}px` });
  }
  return out;
})();

type UploadSlot = 'home-nav-icon' | 'home-bg-image' | 'board-nav-icon';

type AppBrandingHandlers = {
  readonly setHomepageNavbarUseLoginFavicon: (v: boolean) => void;
  readonly setHomepageNavbarIconSizePx: (v: string | null) => void;
  readonly setBoardNavbarIconSizePx: (v: string | null) => void;
  readonly setHomepageNavbarLabel: (v: string) => void;
  readonly setHomepageNavbarLabelInheritAppName: (v: boolean) => void;
  readonly setHomepageNavbarTextColor: (c: string) => void;
  readonly setHomepageNavbarColor: (c: string) => void;
  readonly setHomepageBackgroundMode: (v: HomepageBackgroundMode) => void;
  readonly setHomepageBackgroundColor: (c: string) => void;
  readonly setBoardNavbarIconSameAsHomepage: (v: boolean) => void;
};

const HomeNavIconCard = memo(function HomeNavIconCard({
  iconUrl,
  iconSizePx,
  useLoginFavicon,
  handlers,
  inputRef,
  onFileChange,
  onPickClick,
  onClear,
}: {
  readonly iconUrl: string | undefined;
  readonly iconSizePx: number;
  readonly useLoginFavicon: boolean;
  readonly handlers: AppBrandingHandlers;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClear: () => void;
}) {
  const has = Boolean(iconUrl?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage navbar icon</Title>
        <Text size="sm" c="dimmed">
          Upload a custom image, or leave it empty and choose whether to reuse the login favicon
          (Customisation → Login branding) or the default boards icon.
        </Text>
        <Checkbox
          label="Use custom favicon (Under Login Branding)"
          checked={useLoginFavicon}
          disabled={has}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setHomepageNavbarUseLoginFavicon(e.currentTarget.checked)
          }
        />
        <Text size="xs" c="dimmed">
          When no custom image is uploaded: if this is checked, the home bar uses the login favicon
          when that feature is enabled; otherwise it uses the default layout icon.
        </Text>
        <Text fw={500} size="sm">
          Icon image
        </Text>
        <Group align="flex-end" wrap="wrap">
          {has ? (
            <Box pos="relative" style={{ width: 96, height: 96 }}>
              <Box
                component="img"
                src={iconUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
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
                aria-label="Remove icon"
                onClick={onClear}
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
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          <Button variant="light" leftSection={<IconUpload size={18} />} onClick={onPickClick}>
            {has ? 'Replace' : 'Upload'}
          </Button>
        </Group>
        <Select
          label="Icon size"
          description="Applies to the custom image, favicon fallback, and default kanban layout icon (18–75px)."
          data={NAV_ICON_SIZE_SELECT_DATA}
          value={String(iconSizePx)}
          onChange={handlers.setHomepageNavbarIconSizePx}
        />
      </Stack>
    </Card>
  );
});

const HomeNavLabelCard = memo(function HomeNavLabelCard({
  inherit,
  label,
  handlers,
  disabledInput,
}: {
  readonly inherit: boolean;
  readonly label: string;
  readonly handlers: AppBrandingHandlers;
  readonly disabledInput: boolean;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage navbar label</Title>
        <Checkbox
          label="Inherit text from custom app name (Login branding)"
          checked={inherit}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setHomepageNavbarLabelInheritAppName(e.currentTarget.checked)
          }
        />
        <Text size="sm" c="dimmed">
          When enabled, only the wording matches the login &quot;Application name&quot;. Font and
          weight use the home navbar label style; use navbar text colour below for colour.
        </Text>
        <TextInput
          label="Custom label"
          value={label}
          onChange={(e) => handlers.setHomepageNavbarLabel(e.currentTarget.value)}
          disabled={disabledInput}
          placeholder="e.g. My workspace hub"
        />
      </Stack>
    </Card>
  );
});

const HomeNavTextColorCard = memo(function HomeNavTextColorCard({
  color,
  handlers,
}: {
  readonly color: string;
  readonly handlers: AppBrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage navbar text colour</Title>
        <Text size="sm" c="dimmed">
          Applies to the home nav brand label and the signed-in display name.
        </Text>
        <ColorInput label="Text colour" value={color} onChange={handlers.setHomepageNavbarTextColor} />
      </Stack>
    </Card>
  );
});

const HomeNavBarColorCard = memo(function HomeNavBarColorCard({
  color,
  handlers,
}: {
  readonly color: string;
  readonly handlers: AppBrandingHandlers;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage navbar colour</Title>
        <ColorInput
          label="Navbar background"
          value={color}
          onChange={handlers.setHomepageNavbarColor}
        />
      </Stack>
    </Card>
  );
});

const HomeBackgroundCard = memo(function HomeBackgroundCard({
  mode,
  backgroundColor,
  imageUrl,
  inputRef,
  onFileChange,
  onPickClick,
  onClearImage,
  handlers,
}: {
  readonly mode: HomepageBackgroundMode;
  readonly backgroundColor: string;
  readonly imageUrl: string | undefined;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClearImage: () => void;
  readonly handlers: AppBrandingHandlers;
}) {
  const hasImg = Boolean(imageUrl?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage background colour / image</Title>
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) =>
            handlers.setHomepageBackgroundMode(v === 'image' ? 'image' : 'color')
          }
          data={BG_MODE_SEGMENTS}
        />
        {mode === 'color' ? (
          <ColorInput
            label="Page background"
            value={backgroundColor}
            onChange={handlers.setHomepageBackgroundColor}
          />
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Large images are resized in the browser before upload so they load efficiently. The home
              page uses cover positioning so the background fills the viewport.
            </Text>
            <Group align="flex-end" wrap="wrap">
              {hasImg ? (
                <Box pos="relative" style={{ width: 160, height: 96 }}>
                  <Box
                    component="img"
                    src={imageUrl}
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
                    aria-label="Remove background image"
                    onClick={onClearImage}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Box>
              ) : (
                <Box
                  w={160}
                  h={96}
                  style={{
                    border: '1px dashed var(--mantine-color-gray-4)',
                    borderRadius: 8,
                    background: 'var(--mantine-color-gray-0)',
                  }}
                />
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              <Button variant="light" leftSection={<IconUpload size={18} />} onClick={onPickClick}>
                {hasImg ? 'Replace image' : 'Upload image'}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
});

const BoardNavIconCard = memo(function BoardNavIconCard({
  sameAsHome,
  iconUrl,
  iconSizePx,
  inputRef,
  onFileChange,
  onPickClick,
  onClear,
  handlers,
}: {
  readonly sameAsHome: boolean;
  readonly iconUrl: string | undefined;
  readonly iconSizePx: number;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClear: () => void;
  readonly handlers: AppBrandingHandlers;
}) {
  const has = Boolean(iconUrl?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Board navbar icon</Title>
        <Text size="sm" c="dimmed">
          Icon beside the board title on the board header.
        </Text>
        <Checkbox
          label="Use same icon as homepage navbar"
          checked={sameAsHome}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handlers.setBoardNavbarIconSameAsHomepage(e.currentTarget.checked)
          }
        />
        <Text fw={500} size="sm">
          Board icon image
        </Text>
        <Group align="flex-end" wrap="wrap">
          {has && !sameAsHome ? (
            <Box pos="relative" style={{ width: 96, height: 96 }}>
              <Box
                component="img"
                src={iconUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
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
                aria-label="Remove board icon"
                onClick={onClear}
                disabled={sameAsHome}
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
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            disabled={sameAsHome}
          />
          <Button
            variant="light"
            leftSection={<IconUpload size={18} />}
            onClick={onPickClick}
            disabled={sameAsHome}
          >
            {has && !sameAsHome ? 'Replace' : 'Upload'}
          </Button>
        </Group>
        <Select
          label="Icon size"
          description="Applies to the custom image and default kanban layout icon on the board header (18–75px)."
          data={NAV_ICON_SIZE_SELECT_DATA}
          value={String(iconSizePx)}
          onChange={handlers.setBoardNavbarIconSizePx}
        />
      </Stack>
    </Card>
  );
});

function draftToPublicPreview(d: AppBrandingDraft): PublicAppBranding {
  return mergePublicAppBranding(d) as unknown as PublicAppBranding;
}

function AppBrandingSectionInner() {
  const [draft, setDraft] = useState<AppBrandingDraft>(DEFAULT_APP_BRANDING_DRAFT);
  const [loginPreview, setLoginPreview] = useState<PublicLoginBranding>(() =>
    mergePublicLoginBranding({}) as unknown as PublicLoginBranding
  );
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetModalOpened, { open: openResetModal, close: closeResetModal }] = useDisclosure(false);
  const homeNavIconRef = useRef<HTMLInputElement>(null);
  const homeBgRef = useRef<HTMLInputElement>(null);
  const boardNavIconRef = useRef<HTMLInputElement>(null);
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

  const [debouncedDraft] = useDebouncedValue(draft, 500);
  const previewApp = useMemo(() => draftToPublicPreview(debouncedDraft), [debouncedDraft]);

  const reloadLoginPreview = useCallback(async () => {
    try {
      const { branding } = await api.getLoginBranding();
      if (isMounted.current) {
        setLoginPreview(branding);
      }
    } catch {
      if (isMounted.current) {
        setLoginPreview(mergePublicLoginBranding({}) as unknown as PublicLoginBranding);
      }
    }
  }, []);

  const handlers = useMemo(
    (): AppBrandingHandlers => ({
      setHomepageNavbarUseLoginFavicon: (v) =>
        setDraft((d) => ({ ...d, homepageNavbarUseLoginFavicon: v })),
      setHomepageNavbarIconSizePx: (v) =>
        setDraft((d) => ({
          ...d,
          homepageNavbarIconSizePx: clampAppNavbarIconSizePx(
            v != null ? Number(v) : d.homepageNavbarIconSizePx,
            DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX
          ),
        })),
      setBoardNavbarIconSizePx: (v) =>
        setDraft((d) => ({
          ...d,
          boardNavbarIconSizePx: clampAppNavbarIconSizePx(
            v != null ? Number(v) : d.boardNavbarIconSizePx,
            DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX
          ),
        })),
      setHomepageNavbarLabel: (v) => setDraft((d) => ({ ...d, homepageNavbarLabel: v })),
      setHomepageNavbarLabelInheritAppName: (v) =>
        setDraft((d) => ({ ...d, homepageNavbarLabelInheritAppName: v })),
      setHomepageNavbarTextColor: (c) => setDraft((d) => ({ ...d, homepageNavbarTextColor: c })),
      setHomepageNavbarColor: (c) => setDraft((d) => ({ ...d, homepageNavbarColor: c })),
      setHomepageBackgroundMode: (v) => setDraft((d) => ({ ...d, homepageBackgroundMode: v })),
      setHomepageBackgroundColor: (c) => setDraft((d) => ({ ...d, homepageBackgroundColor: c })),
      setBoardNavbarIconSameAsHomepage: (v) =>
        setDraft((d) => ({ ...d, boardNavbarIconSameAsHomepage: v })),
    }),
    []
  );

  const load = useCallback(async () => {
    try {
      setPageLoading(true);
      setError(null);
      const { config } = await api.getAdminConfig();
      const raw = (config as { appScreenBranding?: Record<string, unknown> }).appScreenBranding;
      setDraft(mergePublicAppBranding(raw as Partial<PublicAppBranding>));
      await reloadLoginPreview();
    } catch (e) {
      console.error(e);
      setError('Failed to load app branding settings');
    } finally {
      if (isMounted.current) {
        setPageLoading(false);
      }
    }
  }, [reloadLoginPreview]);

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
    const onLoginBranding = (): void => {
      void reloadLoginPreview();
    };
    window.addEventListener(LOGIN_BRANDING_UPDATED_EVENT, onLoginBranding);
    return () => window.removeEventListener(LOGIN_BRANDING_UPDATED_EVENT, onLoginBranding);
  }, [reloadLoginPreview]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updateAdminConfig({ appScreenBranding: draftRef.current });
      dispatchAppBrandingUpdated();
      setSuccess('Changes saved');
      scheduleSuccessMessageClear();
    } catch (e) {
      console.error(e);
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [scheduleSuccessMessageClear]);

  const uploadAsset = useCallback(async (file: File | null, slot: UploadSlot) => {
    if (!file) {
      return;
    }
    try {
      setError(null);
      const prevUrl = (): string | undefined => {
        const d = draftRef.current;
        if (slot === 'home-nav-icon') {
          return d.homepageNavbarIconUrl?.trim();
        }
        if (slot === 'home-bg-image') {
          return d.homepageBackgroundImageUrl?.trim();
        }
        return d.boardNavbarIconUrl?.trim();
      };
      const prev = prevUrl();
      if (prev && isAppHostedBrandingAssetUrl(prev)) {
        try {
          await api.deleteBrandingFile(prev);
        } catch {
          /* best-effort */
        }
      }
      const toUpload =
        slot === 'home-bg-image' ? await resizeImageForBackgroundUpload(file) : file;
      const { url } = await api.uploadBrandingFile(toUpload, slot);
      if (slot === 'home-nav-icon') {
        setDraft((d) => ({ ...d, homepageNavbarIconUrl: url }));
      } else if (slot === 'home-bg-image') {
        setDraft((d) => ({ ...d, homepageBackgroundImageUrl: url, homepageBackgroundMode: 'image' }));
      } else {
        setDraft((d) => ({ ...d, boardNavbarIconUrl: url }));
      }
    } catch (e) {
      console.error(e);
      setError(slot === 'home-bg-image' ? 'Background image upload failed' : 'Icon upload failed');
    }
  }, []);

  const clearAsset = useCallback(async (slot: UploadSlot) => {
    const d = draftRef.current;
    const url =
      slot === 'home-nav-icon'
        ? d.homepageNavbarIconUrl?.trim()
        : slot === 'home-bg-image'
          ? d.homepageBackgroundImageUrl?.trim()
          : d.boardNavbarIconUrl?.trim();
    if (url && isAppHostedBrandingAssetUrl(url)) {
      try {
        await api.deleteBrandingFile(url);
      } catch (e) {
        console.error(e);
        setError('Failed to remove file from storage');
        return;
      }
    }
    if (slot === 'home-nav-icon') {
      setDraft((x) => ({ ...x, homepageNavbarIconUrl: '' }));
    } else if (slot === 'home-bg-image') {
      setDraft((x) => ({ ...x, homepageBackgroundImageUrl: '' }));
    } else {
      setDraft((x) => ({ ...x, boardNavbarIconUrl: '' }));
    }
  }, []);

  const handleConfirmReset = useCallback(async () => {
    const d = draftRef.current;
    const urls = [
      d.homepageNavbarIconUrl?.trim(),
      d.homepageBackgroundImageUrl?.trim(),
      d.boardNavbarIconUrl?.trim(),
    ].filter((u): u is string => Boolean(u && isAppHostedBrandingAssetUrl(u)));
    try {
      setResetting(true);
      setError(null);
      await api.updateAdminConfig({ appScreenBranding: getDefaultAppScreenBrandingForReset() });
      const deleteFailures: string[] = [];
      for (const u of urls) {
        try {
          await api.deleteBrandingFile(u);
        } catch {
          deleteFailures.push('file');
        }
      }
      setDraft({ ...DEFAULT_APP_BRANDING_DRAFT });
      [homeNavIconRef, homeBgRef, boardNavIconRef].forEach((r) => {
        const el = r.current;
        if (el) {
          el.value = '';
        }
      });
      dispatchAppBrandingUpdated();
      closeResetModal();
      if (deleteFailures.length > 0) {
        setSuccess(null);
        setError('Defaults were saved, but some files could not be removed from storage.');
      } else {
        setSuccess('App branding reset to defaults');
        scheduleSuccessMessageClear();
      }
    } catch (e) {
      console.error(e);
      setError('Failed to reset app branding');
    } finally {
      setResetting(false);
    }
  }, [closeResetModal, scheduleSuccessMessageClear]);

  const onPick = useCallback((ref: RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
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
        title="Reset app branding to defaults?"
        centered
        closeOnClickOutside={!resetting}
        closeOnEscape={!resetting}
        closeButtonProps={{ disabled: resetting }}
      >
        <Stack gap="md">
          <Text size="sm">
            This clears homepage navbar, background, and board icon settings, saves factory defaults,
            and deletes uploaded app branding files from storage when they are hosted on this app.
          </Text>
          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" onClick={closeResetModal} disabled={resetting}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleConfirmReset()} loading={resetting}>
              Yes, reset everything
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={3}>Boards homepage</Title>
          <Text size="sm" c="dimmed" maw={520} mt="xs">
            Customise the boards home page chrome and the board header home icon.
          </Text>
        </Box>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button variant="default" color="gray" onClick={openResetModal} disabled={saving || resetting}>
            Reset defaults
          </Button>
          <Button color="blue" onClick={() => void handleSave()} loading={saving} disabled={resetting}>
            Save changes
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'flex-start' }}>
        <Stack gap="md">
          <HomeNavIconCard
            iconUrl={draft.homepageNavbarIconUrl}
            iconSizePx={draft.homepageNavbarIconSizePx}
            useLoginFavicon={draft.homepageNavbarUseLoginFavicon}
            handlers={handlers}
            inputRef={homeNavIconRef}
            onFileChange={(f) => {
              void uploadAsset(f, 'home-nav-icon').finally(() => {
                const el = homeNavIconRef.current;
                if (el) {
                  el.value = '';
                }
              });
            }}
            onPickClick={() => onPick(homeNavIconRef)}
            onClear={() => void clearAsset('home-nav-icon')}
          />
          <HomeNavLabelCard
            inherit={draft.homepageNavbarLabelInheritAppName}
            label={draft.homepageNavbarLabel ?? ''}
            handlers={handlers}
            disabledInput={draft.homepageNavbarLabelInheritAppName}
          />
          <HomeNavTextColorCard color={draft.homepageNavbarTextColor} handlers={handlers} />
          <HomeNavBarColorCard color={draft.homepageNavbarColor} handlers={handlers} />
          <HomeBackgroundCard
            mode={draft.homepageBackgroundMode}
            backgroundColor={draft.homepageBackgroundColor}
            imageUrl={draft.homepageBackgroundImageUrl}
            inputRef={homeBgRef}
            onFileChange={(f) => {
              void uploadAsset(f, 'home-bg-image').finally(() => {
                const el = homeBgRef.current;
                if (el) {
                  el.value = '';
                }
              });
            }}
            onPickClick={() => onPick(homeBgRef)}
            onClearImage={() => void clearAsset('home-bg-image')}
            handlers={handlers}
          />
          <BoardNavIconCard
            sameAsHome={draft.boardNavbarIconSameAsHomepage}
            iconUrl={draft.boardNavbarIconUrl}
            iconSizePx={draft.boardNavbarIconSizePx}
            inputRef={boardNavIconRef}
            onFileChange={(f) => {
              void uploadAsset(f, 'board-nav-icon').finally(() => {
                const el = boardNavIconRef.current;
                if (el) {
                  el.value = '';
                }
              });
            }}
            onPickClick={() => onPick(boardNavIconRef)}
            onClear={() => void clearAsset('board-nav-icon')}
            handlers={handlers}
          />
        </Stack>

        <Box
          style={{
            position: 'sticky',
            top: 'var(--mantine-spacing-md)',
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - var(--mantine-spacing-xl))',
            overflowY: 'auto',
            minWidth: 0,
          }}
        >
          <AppBrandingPreviewPane app={previewApp} login={loginPreview} />
        </Box>
      </SimpleGrid>
    </Stack>
  );
}

export const AppBrandingSection = memo(AppBrandingSectionInner);
