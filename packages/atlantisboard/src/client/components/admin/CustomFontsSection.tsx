import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import {
  dispatchAppBrandingUpdated,
  dispatchFontsCatalogUpdated,
} from '../../appBrandingEvents.js';
import {
  SYSTEM_UI_FONT_FAMILY,
  type PublicCustomFontEntry,
} from '../../../shared/types/customFonts.js';

function describeStoredDefaultUiFont(
  stored: string | undefined,
  catalog: readonly PublicCustomFontEntry[]
): string {
  if (stored === undefined || stored === '') {
    return 'Built-in (Poppins)';
  }
  if (stored === SYSTEM_UI_FONT_FAMILY) {
    return 'System UI';
  }
  const match = catalog.find((f) => f.fontFamilyValue === stored);
  return match ? match.displayName : stored;
}

export function CustomFontsSection(): ReactElement {
  const [fonts, setFonts] = useState<PublicCustomFontEntry[]>([]);
  const [storedDefaultUiFont, setStoredDefaultUiFont] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicCustomFontEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const successClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSuccessClear = useCallback((): void => {
    if (successClearTimeoutRef.current !== null) {
      clearTimeout(successClearTimeoutRef.current);
    }
    successClearTimeoutRef.current = setTimeout(() => {
      successClearTimeoutRef.current = null;
      setSuccess(null);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (successClearTimeoutRef.current !== null) {
        clearTimeout(successClearTimeoutRef.current);
        successClearTimeoutRef.current = null;
      }
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [{ fonts: list }, { config }] = await Promise.all([
        api.getFontsCatalog(),
        api.getAdminConfig(),
      ]);
      setFonts(list);
      const ab = config as { appScreenBranding?: { defaultUiFontFamily?: string } };
      const raw = ab.appScreenBranding?.defaultUiFontFamily?.trim();
      setStoredDefaultUiFont(raw && raw.length > 0 ? raw : undefined);
    } catch {
      setError('Failed to load custom fonts');
      setFonts([]);
      setStoredDefaultUiFont(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a font file');
      return;
    }
    try {
      setUploading(true);
      setError(null);
      setSuccess(null);
      await api.uploadCustomFont(file);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      dispatchFontsCatalogUpdated();
      await load();
      setSuccess('Font uploaded');
      scheduleSuccessClear();
    } catch (e) {
      console.error(e);
      setError(
        'Upload failed — use .woff2, .woff, .ttf (including variable / TrueType), or .otf'
      );
    } finally {
      setUploading(false);
    }
  }, [load, scheduleSuccessClear]);

  const applyDefaultUiFont = useCallback(
    async (value: string | null): Promise<void> => {
      try {
        setSettingDefault(true);
        setError(null);
        setSuccess(null);
        await api.updateAdminConfig({
          appScreenBranding: { defaultUiFontFamily: value },
        });
        dispatchAppBrandingUpdated();
        await load();
        setSuccess(
          value === null
            ? 'Default UI font set to built-in (Poppins)'
            : value === SYSTEM_UI_FONT_FAMILY
              ? 'Default UI font set to System UI'
              : 'Default UI font updated'
        );
        scheduleSuccessClear();
      } catch (e) {
        console.error(e);
        setError('Failed to update default UI font');
      } finally {
        setSettingDefault(false);
      }
    },
    [load, scheduleSuccessClear]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      setDeleting(true);
      setError(null);
      await api.deleteCustomFontFile(deleteTarget.fileName);
      setDeleteTarget(null);
      dispatchFontsCatalogUpdated();
      dispatchAppBrandingUpdated();
      await load();
      setSuccess('Font removed');
      scheduleSuccessClear();
    } catch (e) {
      console.error(e);
      setError('Failed to remove font');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load, scheduleSuccessClear]);

  const defaultFontOptions = [
    { value: '__poppins_default__', label: 'Poppins - Default' },
    { value: SYSTEM_UI_FONT_FAMILY, label: 'System UI' },
    ...fonts.map((f) => ({
      value: f.fontFamilyValue,
      label: f.displayName,
    })),
  ];

  if (loading) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack gap="lg">
      <Modal
        opened={deleteTarget !== null}
        onClose={deleting ? () => undefined : () => setDeleteTarget(null)}
        title="Remove this font?"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        closeButtonProps={{ disabled: deleting }}
      >
        <Stack gap="md">
          <Text size="sm">
            {deleteTarget
              ? `Delete “${deleteTarget.displayName}” from storage? Login branding that uses this font will fall back until you pick another font and save. If this font is the app default UI font, the default will be cleared automatically.`
              : null}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleConfirmDelete()} loading={deleting}>
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Box>
        <Title order={3}>Custom fonts</Title>
        <Text size="sm" c="dimmed" maw={560} mt="xs">
          Upload font files for login branding (app name and tagline) and for the default typeface
          across the signed-in application. TrueType (.ttf) is supported, including variable fonts.
          Files are stored in the MinIO fonts bucket at the bucket root (no subfolders).
        </Text>
      </Box>

      <Box>
        <Title order={4} mb="sm">
          Default UI font
        </Title>
        <Text size="sm" c="dimmed" mb="sm" maw={560}>
          One font at a time applies to Mantine components, body text, and Tailwind font-sans
          utilities. Built-in default matches the bundled Poppins stack.
        </Text>
        <Text size="sm" mb="sm">
          Current: <strong>{describeStoredDefaultUiFont(storedDefaultUiFont, fonts)}</strong>
        </Text>
        <Select
          label="Default font"
          data={defaultFontOptions}
          value={storedDefaultUiFont ?? '__poppins_default__'}
          onChange={(value) => {
            if (!value || settingDefault) {
              return;
            }
            if (value === '__poppins_default__') {
              void applyDefaultUiFont(null);
              return;
            }
            void applyDefaultUiFont(value);
          }}
          disabled={settingDefault}
          maw={360}
        />
      </Box>

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}

      <Box>
        <Title order={4} mb="sm">
          Upload a font
        </Title>
        <Stack gap="sm" maw={400}>
          <Text size="sm" c="dimmed">
            Display name is derived from the uploaded file name.
          </Text>
          <input
            ref={fileRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf,font/sfnt,application/font-sfnt"
            style={{ display: 'none' }}
          />
          <Button
            variant="light"
            leftSection={<IconUpload size={18} />}
            onClick={() => fileRef.current?.click()}
          >
            Choose file
          </Button>
          <Button onClick={() => void handleUpload()} loading={uploading} disabled={uploading}>
            Upload
          </Button>
        </Stack>
      </Box>

      <Box>
        <Title order={4} mb="sm">
          Uploaded fonts
        </Title>
        {fonts.length === 0 ? (
          <Text size="sm" c="dimmed">
            No custom fonts yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {fonts.map((f) => (
              <Group key={f.fileName} justify="flex-start" wrap="nowrap" align="center" gap="xs">
                <Box style={{ minWidth: 0 }}>
                  <Text fw={500} truncate>
                    {f.displayName}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {f.fileName}
                  </Text>
                </Box>
                <Button variant="subtle" color="red" size="sm" onClick={() => setDeleteTarget(f)}>
                  Remove
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
