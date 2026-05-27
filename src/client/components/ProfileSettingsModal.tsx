import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  Title,
  Text,
  TextInput,
  Button,
  Group,
  Avatar,
  Checkbox,
  Select,
  Alert,
  Divider,
  FileButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuthContext } from '../contexts/AuthContext.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../constants/iosModalSafeArea.js';
import { useResponsiveTier } from '../hooks/useResponsiveTier.js';
import { api } from '../utils/api.js';
import { resizeImageToSquareAvatarBlob } from '../utils/resizeAvatarImage.js';
import { userMenuStyleAvatarInitials } from '../utils/userMenuStyleAvatarInitials.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

export interface ProfileSettingsModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

function revokePreviewUrl(url: string | null): void {
  if (url !== null && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/** True when the saved picture is our MinIO-backed `/users/avatar/:id` URL (not e.g. Google OAuth). */
function isAppHostedAvatar(userId: string, profilePicture: string | undefined): boolean {
  if (profilePicture === undefined || profilePicture.trim() === '') {
    return false;
  }
  return profilePicture.includes(`/users/avatar/${userId}`);
}

export function ProfileSettingsModal({ opened, onClose }: ProfileSettingsModalProps) {
  const { user, refreshUser } = useAuthContext();
  const isMobile = useResponsiveTier() === 'mobile';

  const [displayName, setDisplayName] = useState('');
  const [languagePref, setLanguagePref] = useState('en');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  /** New image chosen in this session; uploaded on unified Save. */
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const [autoDetect, setAutoDetect] = useState(false);
  const [translateUserUi, setTranslateUserUi] = useState(false);

  const loadFromUserAndServer = useCallback(async () => {
    if (!user) {
      return;
    }
    setDisplayName(user.displayName);
    try {
      const res = (await api.getUserPreferences()) as {
        preferences?: { language?: string };
      };
      const p = res.preferences;
      if (p?.language !== undefined) {
        setLanguagePref(p.language);
      }
    } catch {
      setLanguagePref(user.preferences.language);
    }
  }, [user]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    void loadFromUserAndServer();
    setPendingAvatarFile(null);
    setAvatarPreviewUrl((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
    setAutoDetect(false);
    setTranslateUserUi(false);
    setSaveError(null);
  }, [opened, loadFromUserAndServer]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handlePickAvatar = (file: File | null): void => {
    setSaveError(null);
    setAvatarPreviewUrl((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
    setPendingAvatarFile(null);
    if (!file) {
      return;
    }
    setPendingAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = async (): Promise<void> => {
    if (!user) {
      return;
    }
    setSaveError(null);
    setRemovingAvatar(true);
    try {
      await api.deleteProfilePicture();
      await refreshUser();
      handlePickAvatar(null);
      notifications.show({
        title: 'Removed',
        message: 'Profile photo removed.',
        color: 'green',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove profile photo');
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleSaveAll = async (): Promise<void> => {
    if (!user) {
      return;
    }
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      setSaveError('Display name is required.');
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      await api.updateUserProfile({ displayName: trimmed });
      await api.updateUserPreferences({ language: languagePref });

      if (pendingAvatarFile !== null) {
        const { blob, mimeType } = await resizeImageToSquareAvatarBlob(pendingAvatarFile);
        const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
        await api.uploadProfilePicture(blob, `avatar.${ext}`, mimeType);
      }

      await refreshUser();

      setPendingAvatarFile(null);
      setAvatarPreviewUrl((prev) => {
        revokePreviewUrl(prev);
        return null;
      });

      notifications.show({ title: 'Saved', message: 'Profile settings updated.', color: 'green' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save profile settings.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const initials =
    user !== null
      ? userMenuStyleAvatarInitials(user.displayName, user.username)
      : '';

  const avatarSrc =
    avatarPreviewUrl ??
    (user !== null && user.profilePicture != null && user.profilePicture !== ''
      ? user.profilePicture
      : undefined);

  const showRemoveAvatar =
    user !== null &&
    pendingAvatarFile === null &&
    isAppHostedAvatar(user.id, user.profilePicture);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Profile Settings"
      size="md"
      fullScreen={isMobile}
      centered={!isMobile}
      {...(isMobile ? { closeButtonProps: { size: 'lg' as const } } : {})}
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
      styles={modalStylesFullscreenSafeBody(isMobile)}
    >
      {!user ? null : (
        <Stack gap="lg">
          {saveError ? (
            <Alert color="red" onClose={() => setSaveError(null)} withCloseButton>
              {saveError}
            </Alert>
          ) : null}

          <Stack gap="sm">
            <Title order={5}>Display name</Title>
            <TextInput
              label="Display name"
              value={displayName}
              onChange={(ev) => setDisplayName(ev.currentTarget.value)}
              required
            />
          </Stack>

          <Divider />

          <Stack gap="sm">
            <Title order={5}>Avatar</Title>
            <Text size="sm" c="dimmed">
              Choose an image, then save at the bottom to apply.
            </Text>
            <Group gap="md" align="center" wrap="wrap">
              <Avatar
                key={avatarSrc ?? 'no-src'}
                {...(avatarSrc !== undefined ? { src: avatarSrc } : {})}
                size={96}
                style={{ flexShrink: 0 }}
              >
                {initials}
              </Avatar>
              <FileButton onChange={handlePickAvatar} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button
                    {...props}
                    variant="light"
                    disabled={saving || removingAvatar}
                  >
                    {pendingAvatarFile ? 'Change image' : 'Choose image'}
                  </Button>
                )}
              </FileButton>
              {showRemoveAvatar ? (
                <Button
                  variant="light"
                  color="red"
                  disabled={saving || removingAvatar}
                  loading={removingAvatar}
                  onClick={() => void handleRemoveAvatar()}
                >
                  Remove
                </Button>
              ) : null}
              {pendingAvatarFile ? (
                <Button
                  variant="subtle"
                  color="gray"
                  disabled={saving || removingAvatar}
                  onClick={() => {
                    handlePickAvatar(null);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </Group>
          </Stack>

          <Divider />

          <Stack gap="sm">
            <Title order={5}>Language</Title>
            <Group align="flex-end" gap="md" wrap="wrap">
              <Select
                label="Display language"
                data={LANGUAGE_OPTIONS}
                value={languagePref}
                onChange={(v) => setLanguagePref(v ?? 'en')}
                style={{ flex: '1 1 200px' }}
              />
              <Group gap="lg" wrap="nowrap">
                <Checkbox
                  label="Autodetect"
                  checked={autoDetect}
                  onChange={(e) => setAutoDetect(e.currentTarget.checked)}
                />
                <Checkbox
                  label="Translate user created interface"
                  checked={translateUserUi}
                  onChange={(e) => setTranslateUserUi(e.currentTarget.checked)}
                />
              </Group>
            </Group>
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} disabled={saving} size={isMobile ? 'md' : 'sm'}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveAll()} loading={saving} size={isMobile ? 'md' : 'sm'}>
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
