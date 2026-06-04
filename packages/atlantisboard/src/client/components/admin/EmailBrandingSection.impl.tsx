import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  ColorInput,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { api } from '../../utils/api.js';
import {
  EmailBrandingPreviewPane,
  type EmailTemplateType,
} from './EmailBrandingPreviewPane.js';

interface EmailBrandingDraft {
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly buttonColor: string;
  readonly buttonTextColor: string;
  readonly linkColor: string;
  readonly footerText: string;
}

interface BrandingIdentity {
  readonly logoUrl: string | null;
  readonly appName: string;
}

const DEFAULT_EMAIL_BRANDING: EmailBrandingDraft = {
  backgroundColor: '#f2efe5',
  textColor: '#38322d',
  buttonColor: '#1a1a1a',
  buttonTextColor: '#ffffff',
  linkColor: '#4da6d8',
  footerText: '',
};

function EmailBrandingSectionInner() {
  const [draft, setDraft] = useState<EmailBrandingDraft>(DEFAULT_EMAIL_BRANDING);
  const [identity, setIdentity] = useState<BrandingIdentity>({ logoUrl: null, appName: 'Your App' });
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateType>('password-reset');
  const isMounted = useRef(true);
  const successClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [debouncedDraft] = useDebouncedValue(draft, 300);

  const scheduleSuccessMessageClear = useCallback((): void => {
    if (successClearTimeoutRef.current !== null) clearTimeout(successClearTimeoutRef.current);
    successClearTimeoutRef.current = setTimeout(() => {
      successClearTimeoutRef.current = null;
      if (isMounted.current) setSuccess(null);
    }, 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      setPageLoading(true);
      setError(null);
      const { config } = await api.getAdminConfig();
      const cfg = config as Record<string, unknown>;

      const eb = cfg.emailBranding as Partial<EmailBrandingDraft> | undefined;
      if (eb != null) {
        setDraft({
          backgroundColor: typeof eb.backgroundColor === 'string' ? eb.backgroundColor : DEFAULT_EMAIL_BRANDING.backgroundColor,
          textColor: typeof eb.textColor === 'string' ? eb.textColor : DEFAULT_EMAIL_BRANDING.textColor,
          buttonColor: typeof eb.buttonColor === 'string' ? eb.buttonColor : DEFAULT_EMAIL_BRANDING.buttonColor,
          buttonTextColor: typeof eb.buttonTextColor === 'string' ? eb.buttonTextColor : DEFAULT_EMAIL_BRANDING.buttonTextColor,
          linkColor: typeof eb.linkColor === 'string' ? eb.linkColor : DEFAULT_EMAIL_BRANDING.linkColor,
          footerText: typeof eb.footerText === 'string' ? eb.footerText : DEFAULT_EMAIL_BRANDING.footerText,
        });
      }

      const app = cfg.appScreenBranding as Record<string, unknown> | undefined;
      const login = cfg.loginScreenBranding as Record<string, unknown> | undefined;
      const smtp = cfg.smtp as Record<string, unknown> | undefined;

      let logoUrl: string | null = null;
      if (app?.homepageNavbarUseLoginFavicon !== false && typeof login?.faviconUrl === 'string' && login.faviconUrl) {
        logoUrl = login.faviconUrl as string;
      } else if (typeof app?.homepageNavbarIconUrl === 'string' && app.homepageNavbarIconUrl) {
        logoUrl = app.homepageNavbarIconUrl as string;
      }

      const appName = (typeof smtp?.fromName === 'string' && smtp.fromName) ? smtp.fromName : 'Your App';

      setIdentity({ logoUrl, appName });
    } catch (e) {
      console.error(e);
      setError('Failed to load email branding settings');
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

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updateAdminConfig({
        emailBranding: {
          backgroundColor: draftRef.current.backgroundColor,
          textColor: draftRef.current.textColor,
          buttonColor: draftRef.current.buttonColor,
          buttonTextColor: draftRef.current.buttonTextColor,
          linkColor: draftRef.current.linkColor,
          footerText: draftRef.current.footerText,
        },
      });
      setSuccess('Email branding saved');
      scheduleSuccessMessageClear();
    } catch (e) {
      console.error(e);
      setError('Failed to save email branding');
    } finally {
      setSaving(false);
    }
  }, [scheduleSuccessMessageClear]);

  if (pageLoading) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={3}>Email Branding</Title>
          <Text size="sm" c="dimmed" maw={520} mt="xs">
            Customise the colours and footer text used in outgoing emails such as password resets and
            verification links.
          </Text>
        </Box>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button color="blue" onClick={() => void handleSave()} loading={saving}>
            Save changes
          </Button>
        </Group>
      </Group>

      {error != null && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success != null && <Alert color="green">{success}</Alert>}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'flex-start' }}>
        <Stack gap="md">
          <Card withBorder radius="md" p="lg">
            <Title order={5} mb="md">
              Colours
            </Title>
            <Stack gap="sm">
              <ColorInput
                label="Background colour"
                description="Card / content area background"
                value={draft.backgroundColor}
                onChange={(c) => setDraft((d) => ({ ...d, backgroundColor: c }))}
                format="hex"
                swatches={['#f2efe5', '#ffffff', '#f8f9fa', '#1a1a2e', '#0d1117']}
              />
              <ColorInput
                label="Text colour"
                description="Heading and body text"
                value={draft.textColor}
                onChange={(c) => setDraft((d) => ({ ...d, textColor: c }))}
                format="hex"
                swatches={['#38322d', '#212529', '#000000', '#ffffff', '#e0e0e0']}
              />
              <ColorInput
                label="Button colour"
                description="CTA button background"
                value={draft.buttonColor}
                onChange={(c) => setDraft((d) => ({ ...d, buttonColor: c }))}
                format="hex"
                swatches={['#1a1a1a', '#228be6', '#40c057', '#e64980', '#7950f2']}
              />
              <ColorInput
                label="Button text colour"
                description="CTA button label"
                value={draft.buttonTextColor}
                onChange={(c) => setDraft((d) => ({ ...d, buttonTextColor: c }))}
                format="hex"
                swatches={['#ffffff', '#000000', '#f8f9fa', '#212529']}
              />
              <ColorInput
                label="Link colour"
                description="Fallback URL links"
                value={draft.linkColor}
                onChange={(c) => setDraft((d) => ({ ...d, linkColor: c }))}
                format="hex"
                swatches={['#4da6d8', '#228be6', '#1c7ed6', '#15aabf', '#7950f2']}
              />
            </Stack>
          </Card>

          <Card withBorder radius="md" p="lg">
            <Title order={5} mb="md">
              Footer
            </Title>
            <TextInput
              label="Custom footer text"
              description="Leave blank to use the default"
              placeholder="This email was sent by {{appName}}."
              value={draft.footerText}
              onChange={(e) => setDraft((d) => ({ ...d, footerText: e.currentTarget.value }))}
            />
          </Card>
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
          <EmailBrandingPreviewPane
            backgroundColor={debouncedDraft.backgroundColor}
            textColor={debouncedDraft.textColor}
            buttonColor={debouncedDraft.buttonColor}
            buttonTextColor={debouncedDraft.buttonTextColor}
            linkColor={debouncedDraft.linkColor}
            footerText={debouncedDraft.footerText}
            logoUrl={identity.logoUrl}
            appName={identity.appName}
            selectedTemplate={selectedTemplate}
            onTemplateChange={setSelectedTemplate}
          />
        </Box>
      </SimpleGrid>
    </Stack>
  );
}

export const EmailBrandingSection = memo(EmailBrandingSectionInner);
