import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { isAppHostedBrandingAssetUrl } from '../../../../shared/brandingAssetUrl.js';
import {
  DEFAULT_APP_BRANDING_DRAFT,
  DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX,
  DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX,
  clampAppNavbarIconSizePx,
  getDefaultAppScreenBrandingForReset,
  mergePublicAppBranding,
  type AppBrandingDraft,
  type PublicAppBranding,
} from '../../../../shared/types/appBranding.js';
import { mergePublicLoginBranding, type PublicLoginBranding } from '../../../../shared/types/loginBranding.js';
import { dispatchAppBrandingUpdated, LOGIN_BRANDING_UPDATED_EVENT } from '../../../appBrandingEvents.js';
import { api } from '../../../utils/api.js';
import { resizeImageForBackgroundUpload } from '../../../utils/resizeImageForBackgroundUpload.js';
import { draftToPublicPreview, type AppBrandingHandlers, type UploadSlot } from './helpers.js';

interface UseAppBrandingSectionControllerResult {
  readonly draft: AppBrandingDraft;
  readonly handlers: AppBrandingHandlers;
  readonly loginPreview: PublicLoginBranding;
  readonly previewApp: PublicAppBranding;
  readonly pageLoading: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly success: string | null;
  readonly resetting: boolean;
  readonly resetModalOpened: boolean;
  readonly homeNavIconRef: RefObject<HTMLInputElement | null>;
  readonly homeBgRef: RefObject<HTMLInputElement | null>;
  readonly boardNavIconRef: RefObject<HTMLInputElement | null>;
  readonly openResetModal: () => void;
  readonly closeResetModal: () => void;
  readonly clearError: () => void;
  readonly handleSave: () => Promise<void>;
  readonly handleConfirmReset: () => Promise<void>;
  readonly clearAsset: (slot: UploadSlot) => Promise<void>;
  readonly onPick: (ref: RefObject<HTMLInputElement | null>) => void;
  readonly onUploadAndClearInput: (file: File | null, slot: UploadSlot) => Promise<void>;
}

const defaultLoginBranding = (): PublicLoginBranding => mergePublicLoginBranding({}) as PublicLoginBranding;

export function useAppBrandingSectionController(): UseAppBrandingSectionControllerResult {
  const [draft, setDraft] = useState<AppBrandingDraft>(DEFAULT_APP_BRANDING_DRAFT);
  const [loginPreview, setLoginPreview] = useState<PublicLoginBranding>(defaultLoginBranding);
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
        setLoginPreview(defaultLoginBranding());
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
            DEFAULT_HOMEPAGE_NAVBAR_ICON_SIZE_PX,
          ),
        })),
      setBoardNavbarIconSizePx: (v) =>
        setDraft((d) => ({
          ...d,
          boardNavbarIconSizePx: clampAppNavbarIconSizePx(
            v != null ? Number(v) : d.boardNavbarIconSizePx,
            DEFAULT_BOARD_NAVBAR_ICON_SIZE_PX,
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
    [],
  );

  const load = useCallback(async () => {
    try {
      setPageLoading(true);
      setError(null);
      const { config } = await api.getAdminConfig();
      const raw = (config as { appScreenBranding?: Record<string, unknown> }).appScreenBranding;
      setDraft(mergePublicAppBranding(raw as Partial<PublicAppBranding>));
      await reloadLoginPreview();
    } catch (loadError) {
      console.error(loadError);
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
    } catch (saveError) {
      console.error(saveError);
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
      const previousUrl = (() => {
        const currentDraft = draftRef.current;
        if (slot === 'home-nav-icon') {
          return currentDraft.homepageNavbarIconUrl?.trim();
        }
        if (slot === 'home-bg-image') {
          return currentDraft.homepageBackgroundImageUrl?.trim();
        }
        return currentDraft.boardNavbarIconUrl?.trim();
      })();
      if (previousUrl && isAppHostedBrandingAssetUrl(previousUrl)) {
        try {
          await api.deleteBrandingFile(previousUrl);
        } catch {
          // best-effort
        }
      }
      const toUpload = slot === 'home-bg-image' ? await resizeImageForBackgroundUpload(file) : file;
      const { url } = await api.uploadBrandingFile(toUpload, slot);
      if (slot === 'home-nav-icon') {
        setDraft((d) => ({ ...d, homepageNavbarIconUrl: url }));
      } else if (slot === 'home-bg-image') {
        setDraft((d) => ({ ...d, homepageBackgroundImageUrl: url, homepageBackgroundMode: 'image' }));
      } else {
        setDraft((d) => ({ ...d, boardNavbarIconUrl: url }));
      }
    } catch (uploadError) {
      console.error(uploadError);
      setError(slot === 'home-bg-image' ? 'Background image upload failed' : 'Icon upload failed');
    }
  }, []);

  const clearAsset = useCallback(async (slot: UploadSlot) => {
    const currentDraft = draftRef.current;
    const url =
      slot === 'home-nav-icon'
        ? currentDraft.homepageNavbarIconUrl?.trim()
        : slot === 'home-bg-image'
          ? currentDraft.homepageBackgroundImageUrl?.trim()
          : currentDraft.boardNavbarIconUrl?.trim();
    if (url && isAppHostedBrandingAssetUrl(url)) {
      try {
        await api.deleteBrandingFile(url);
      } catch (clearError) {
        console.error(clearError);
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
    const currentDraft = draftRef.current;
    const urls = [
      currentDraft.homepageNavbarIconUrl?.trim(),
      currentDraft.homepageBackgroundImageUrl?.trim(),
      currentDraft.boardNavbarIconUrl?.trim(),
    ].filter((url): url is string => Boolean(url && isAppHostedBrandingAssetUrl(url)));
    try {
      setResetting(true);
      setError(null);
      await api.updateAdminConfig({ appScreenBranding: getDefaultAppScreenBrandingForReset() });
      const deleteFailures: string[] = [];
      for (const url of urls) {
        try {
          await api.deleteBrandingFile(url);
        } catch {
          deleteFailures.push('file');
        }
      }
      setDraft({ ...DEFAULT_APP_BRANDING_DRAFT });
      [homeNavIconRef, homeBgRef, boardNavIconRef].forEach((ref) => {
        const element = ref.current;
        if (element) {
          element.value = '';
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
    } catch (resetError) {
      console.error(resetError);
      setError('Failed to reset app branding');
    } finally {
      setResetting(false);
    }
  }, [closeResetModal, scheduleSuccessMessageClear]);

  const onPick = useCallback((ref: RefObject<HTMLInputElement | null>) => {
    const element = ref.current;
    if (element) {
      element.value = '';
      element.click();
    }
  }, []);

  const onUploadAndClearInput = useCallback(
    async (file: File | null, slot: UploadSlot) => {
      const targetRef =
        slot === 'home-nav-icon' ? homeNavIconRef : slot === 'home-bg-image' ? homeBgRef : boardNavIconRef;
      await uploadAsset(file, slot);
      const element = targetRef.current;
      if (element) {
        element.value = '';
      }
    },
    [uploadAsset],
  );

  return {
    draft,
    handlers,
    loginPreview,
    previewApp,
    pageLoading,
    saving,
    error,
    success,
    resetting,
    resetModalOpened,
    homeNavIconRef,
    homeBgRef,
    boardNavIconRef,
    openResetModal,
    closeResetModal,
    clearError: () => setError(null),
    handleSave,
    handleConfirmReset,
    clearAsset,
    onPick,
    onUploadAndClearInput,
  };
}
