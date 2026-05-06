import { memo, type ChangeEvent } from 'react';
import { Box, Card, ColorInput, SegmentedControl, Select, Stack, Text, Title } from '@mantine/core';
import { BrandedLoginCard } from '../../auth/BrandedLoginCard.js';
import { BrandingSwitch } from '../BrandingSwitch.js';
import type { LoginBoxStyle, PublicLoginBranding } from '../../../../shared/types/loginBranding.js';
import type { BrandingHandlers } from './types.js';

const BACKGROUND_TYPE_SELECT_DATA = [
  { value: 'solid', label: 'Solid Color' },
  { value: 'gradient', label: 'Gradient' },
] as const;

const LOGIN_BOX_STYLE_SEGMENT_DATA: { value: LoginBoxStyle; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'fullscreen', label: 'Fullscreen' },
];

export const LoginBrandingCardPreview = memo(function LoginBrandingCardPreview({
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

export const LoginBrandingBackgroundCard = memo(function LoginBrandingBackgroundCard({
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
          onChange={(e: ChangeEvent<HTMLInputElement>) => handlers.setBackgroundEnabled(e.currentTarget.checked)}
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

export const LoginBrandingLoginBoxStyleCard = memo(function LoginBrandingLoginBoxStyleCard({
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
          Box keeps the sign-in card on your custom background. Fullscreen uses the page background edge-to-edge without a separate card panel.
        </Text>
        <SegmentedControl
          fullWidth
          value={loginBoxStyle}
          onChange={(value) => handlers.setLoginBoxStyle(value === 'fullscreen' ? 'fullscreen' : 'box')}
          data={LOGIN_BOX_STYLE_SEGMENT_DATA}
        />
      </Stack>
    </Card>
  );
});

export const LoginBrandingLoginBoxCard = memo(function LoginBrandingLoginBoxCard({
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
        <ColorInput label="Login Box Background" value={loginBoxBackgroundColor} onChange={handlers.setLoginBoxBackgroundColor} />
        <ColorInput label="Google Button Background" value={googleButtonBackgroundColor} onChange={handlers.setGoogleButtonBackgroundColor} />
        <ColorInput
          label="Input Title Colour"
          description="Email, password, Remember me, and “Don’t have an account?” text"
          value={loginInputTitleColor}
          onChange={handlers.setLoginInputTitleColor}
        />
        <ColorInput label="Link Title Colour" description="Forgot password and Sign up links" value={loginLinkTitleColor} onChange={handlers.setLoginLinkTitleColor} />
        <ColorInput label="Sign in Button text colour" value={loginSignInButtonTextColor} onChange={handlers.setLoginSignInButtonTextColor} />
        <ColorInput label="Sign in Button colour" value={loginSignInButtonColor} onChange={handlers.setLoginSignInButtonColor} />
        <ColorInput label="Google Button Text Color" value={googleButtonTextColor} onChange={handlers.setGoogleButtonTextColor} />
      </Stack>
    </Card>
  );
});

export const LoginBrandingPreviewPane = memo(function LoginBrandingPreviewPane({
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
      <Text fw={600} size="sm" mb="sm">Live Preview</Text>
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
        <LoginBrandingCardPreview branding={previewBranding} showLocalForm={showLocalForm} showGoogle={showGoogle} />
      </Box>
    </Box>
  );
});
