import { type CSSProperties, type FormEvent, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { type PublicLoginBranding } from '../../../shared/types/loginBranding.js';
import { useIsPwa } from '../../hooks/usePwaDisplayMode.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import './brandedLoginCard.css';

export function GoogleMark(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }}
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export interface BrandedLoginCardProps {
  readonly branding: PublicLoginBranding;
  readonly showLocalForm: boolean;
  readonly showGoogle: boolean;
  readonly variant: 'live' | 'preview';
  readonly loginOptionsLoading?: boolean;
  readonly error?: string | null;
  readonly formData?: { email: string; password: string };
  readonly onFormDataChange?: (next: { email: string; password: string }) => void;
  readonly onSubmit?: (e: FormEvent) => void;
  readonly submitLoading?: boolean;
  readonly onGoogleClick?: () => void;
  /** Opens registration modal on live login when email/password sign-in is enabled. */
  readonly onSignUpClick?: () => void;
  /** Opens forgot-password modal on live login when email/password sign-in is enabled. */
  readonly onForgotPasswordClick?: () => void;
}

export function BrandedLoginCard({
  branding,
  showLocalForm,
  showGoogle,
  variant,
  loginOptionsLoading = false,
  error = null,
  formData = { email: '', password: '' },
  onFormDataChange,
  onSubmit,
  submitLoading = false,
  onGoogleClick,
  onSignUpClick,
  onForgotPasswordClick,
}: BrandedLoginCardProps): ReactElement {
  const isPwa = useIsPwa();
  const responsiveTier = useResponsiveTier();
  const actionButtonSize = responsiveTier === 'mobile' ? 'md' : 'sm';
  const pageBgStyle: CSSProperties = branding.backgroundEnabled
    ? branding.backgroundType === 'gradient'
      ? {
          background: `linear-gradient(135deg, ${branding.backgroundColor} 0%, ${branding.backgroundGradientEnd} 100%)`,
        }
      : { backgroundColor: branding.backgroundColor }
    : { backgroundColor: 'var(--mantine-color-gray-0)' };

  const isFullscreen = branding.loginBoxStyle === 'fullscreen';
  const cardBg = branding.loginBoxBackgroundColor || undefined;
  const showBothMethods = showLocalForm && showGoogle;
  const showDivider = showBothMethods;
  const inputTitleColor = branding.loginInputTitleColor;
  const linkTitleColor = branding.loginLinkTitleColor;
  const signInBtnBg = branding.loginSignInButtonColor;
  const signInBtnText = branding.loginSignInButtonTextColor;
  const inputLabelStyles = {
    label: { color: inputTitleColor },
    wrapper: {
      borderColor: 'transparent',
      boxShadow: 'none',
    },
    input: {
      borderColor: 'transparent',
      boxShadow: 'none',
    },
  } as const;
  const signInButtonStyles = {
    root: {
      backgroundColor: signInBtnBg,
      color: signInBtnText,
      border: 'none',
      boxShadow: 'none',
    },
  } as const;

  const isPreview = variant === 'preview';

  const headerBlock = (
    <Box ta="center">
      {branding.logoEnabled && branding.logo ? (
        <img
          src={branding.logo}
          alt=""
          className={showBothMethods && !isPreview ? 'kb-login-logo--compact' : undefined}
          style={{
            width: branding.logoSizePx,
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '50%',
            objectFit: 'cover',
            margin: isPreview ? '0 auto 8px' : showBothMethods ? '0 auto 8px' : '0 auto 16px',
            display: 'block',
          }}
        />
      ) : null}
      {branding.appNameEnabled && branding.appName ? (
        <Title
          order={1}
          fw={700}
          {...(isPreview ? {} : { mb: 'xs' })}
          style={{
            fontFamily:
              'var(--kb-branding-app-name-font-family, var(--kb-app-ui-font-family))',
            fontSize: branding.appNameFontSizePx,
            color: branding.appNameColor,
            lineHeight: 1.15,
            ...(isPreview ? { marginBottom: 6 } : {}),
          }}
        >
          {branding.appName}
        </Title>
      ) : (
        <Title
          order={1}
          size="h2"
          fw={700}
          {...(isPreview ? {} : { mb: 'xs' })}
          style={isPreview ? { marginBottom: 6 } : undefined}
        >
          Atlantisboard
        </Title>
      )}
      {branding.taglineEnabled && branding.tagline ? (
        <Text
          size="sm"
          style={{
            fontFamily:
              'var(--kb-branding-tagline-font-family, var(--kb-app-ui-font-family))',
            fontSize: branding.taglineFontSizePx,
            color: branding.taglineColor,
            lineHeight: 1.4,
          }}
        >
          {branding.tagline}
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          Sign in to your account
        </Text>
      )}
    </Box>
  );

  const localFormLive = (
    <form onSubmit={onSubmit}>
      <Stack gap="md">
        <TextInput
          label="Email"
          type="email"
          placeholder="name@example.com"
          value={formData.email}
          onChange={(e) =>
            onFormDataChange?.({ ...formData, email: e.currentTarget.value })
          }
          autoComplete="email"
          required
          styles={inputLabelStyles}
        />
        <TextInput
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={(e) =>
            onFormDataChange?.({ ...formData, password: e.currentTarget.value })
          }
          autoComplete="current-password"
          required
          styles={inputLabelStyles}
        />
        <Group justify="space-between">
          <Checkbox
            size="sm"
            label="Remember me"
            styles={{ label: { color: inputTitleColor } }}
          />
          {onForgotPasswordClick ? (
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={onForgotPasswordClick}
              style={{
                color: linkTitleColor,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
              }}
            >
              Forgot password?
            </Anchor>
          ) : (
            <Anchor component={Link} to="/login" size="sm" style={{ color: linkTitleColor }}>
              Forgot password?
            </Anchor>
          )}
        </Group>
        <Button
          type="submit"
          fullWidth
          size={actionButtonSize}
          loading={submitLoading}
          mt="md"
          styles={signInButtonStyles}
        >
          {submitLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </Stack>
    </form>
  );

  const localFormPreview = (
    <Box
      component="form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Email"
          type="email"
          placeholder="name@example.com"
          defaultValue="you@example.com"
          readOnly
          tabIndex={-1}
          styles={inputLabelStyles}
        />
        <TextInput
          label="Password"
          type="password"
          placeholder="Enter your password"
          defaultValue="••••••••"
          readOnly
          tabIndex={-1}
          styles={inputLabelStyles}
        />
        <Group justify="space-between" wrap="nowrap" style={{ pointerEvents: 'none' }}>
          <Checkbox
            size="sm"
            label="Remember me"
            tabIndex={-1}
            styles={{ label: { color: inputTitleColor } }}
          />
          <Text
            size="sm"
            td="underline"
            style={{ cursor: 'default', color: linkTitleColor }}
            role="presentation"
          >
            Forgot password?
          </Text>
        </Group>
        <Button type="button" fullWidth size={actionButtonSize} mt="md" styles={signInButtonStyles}>
          Sign in
        </Button>
      </Stack>
    </Box>
  );

  const googleBtn = (
    <Button
      type="button"
      variant="filled"
      fullWidth
      size={actionButtonSize}
      onClick={variant === 'live' ? onGoogleClick : undefined}
      leftSection={<GoogleMark />}
      styles={{
        root: {
          backgroundColor: branding.googleButtonBackgroundColor,
          color: branding.googleButtonTextColor,
          border: 'none',
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: branding.googleButtonBackgroundColor,
            filter: 'brightness(0.96)',
          },
        },
      }}
    >
      Continue with Google
    </Button>
  );

  const footerLive = showLocalForm ? (
    <Text ta="center" size="sm" mt="md">
      <Text span style={{ color: inputTitleColor }}>
        Don&apos;t have an account?{' '}
      </Text>
      {onSignUpClick ? (
        <Anchor
          component="button"
          type="button"
          fw={500}
          onClick={onSignUpClick}
          style={{
            color: linkTitleColor,
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
          }}
        >
          Sign up
        </Anchor>
      ) : (
        <Anchor component={Link} to="/login" fw={500} style={{ color: linkTitleColor }}>
          Sign up
        </Anchor>
      )}
    </Text>
  ) : null;

  const footerPreview = showLocalForm ? (
    <Text ta="center" size="sm" mt="md">
      <Text span style={{ color: inputTitleColor }}>
        Don&apos;t have an account?{' '}
      </Text>
      <Text
        component="span"
        fw={500}
        style={{ cursor: 'default', color: linkTitleColor }}
        role="presentation"
      >
        Sign up
      </Text>
    </Text>
  ) : null;

  const inner = (
    <Card
      {...(isFullscreen
        ? { withBorder: false as const }
        : { shadow: 'lg' as const, withBorder: false as const })}
      padding={isPreview ? 0 : 'xl'}
      w="100%"
      maw={isFullscreen ? 440 : 400}
      radius="md"
      styles={{
        root: {
          backgroundColor: isFullscreen ? 'transparent' : cardBg,
          ...(isFullscreen ? { boxShadow: 'none', borderWidth: 0 } : { border: 'none' }),
          ...(isPreview
            ? {
                paddingTop: 2,
                paddingLeft: 'var(--mantine-spacing-sm)',
                paddingRight: 'var(--mantine-spacing-sm)',
                paddingBottom: 'var(--mantine-spacing-sm)',
              }
            : {}),
        },
      }}
    >
      <Stack gap={isPreview ? 'sm' : showBothMethods ? 'md' : 'lg'}>
        {headerBlock}
        {variant === 'live' && loginOptionsLoading ? (
          <Text size="sm" c="dimmed" ta="center">
            Loading sign-in options…
          </Text>
        ) : null}
        {variant === 'live' && error ? (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        ) : null}
        {showLocalForm && variant === 'live' ? localFormLive : null}
        {showLocalForm && variant === 'preview' ? localFormPreview : null}
        {showDivider ? <Divider label="OR" labelPosition="center" my="xs" /> : null}
        {showGoogle ? googleBtn : null}
        {variant === 'live' ? footerLive : footerPreview}
      </Stack>
    </Card>
  );

  if (variant === 'preview') {
    return (
      <div
        className="flex w-full items-start justify-center px-3 pb-3 pt-0"
        style={pageBgStyle}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={`kb-login-host${isPwa ? ' kb-login-host--pwa' : ''}${
        showBothMethods ? ' kb-login-host--scrollable' : ''
      } min-h-screen flex ${
        showBothMethods ? 'items-start pt-8 md:pt-12' : 'items-center'
      } justify-center ${isFullscreen ? 'p-4 md:p-8' : 'p-4'}`}
      style={pageBgStyle}
    >
      {inner}
    </div>
  );
}
