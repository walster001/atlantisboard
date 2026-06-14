import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Checkbox,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useAppBranding } from '../../contexts/AppBrandingContext.js';
import { useIsPwa } from '../../hooks/usePwaDisplayMode.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { api } from '../../utils/api.js';
import {
  getLoginPageBackgroundStyle,
  getLoginSignInButtonStyles,
} from '../../utils/loginBrandingStyles.js';
import './privacyPolicyContent.css';
import './privacyPolicyAcceptanceCard.css';

interface PrivacyPolicyAcceptanceCardProps {
  readonly onAccept: () => Promise<void>;
}

export function PrivacyPolicyAcceptanceCard({
  onAccept,
}: PrivacyPolicyAcceptanceCardProps): ReactElement {
  const { branding, loginBrandingReady } = useAppBranding();
  const isPwa = useIsPwa();
  const isMobile = useResponsiveTier() === 'mobile';
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pageBgStyle = getLoginPageBackgroundStyle(branding);
  const signInButtonStyles = getLoginSignInButtonStyles(branding);
  const isFullscreen = branding.loginBoxStyle === 'fullscreen';
  const cardBg = branding.loginBoxBackgroundColor || undefined;
  const linkTitleColor = branding.loginLinkTitleColor;
  const inputTitleColor = branding.loginInputTitleColor;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const document = await api.getPrivacyPolicy();
        if (!cancelled) {
          setHtml(document.html);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not load the privacy notice. Please try again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      return undefined;
    }
    const html = document.documentElement;
    const { body } = document;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isMobile]);

  const handleAccept = async (): Promise<void> => {
    if (!agreed) {
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onAccept();
    } catch {
      setSubmitError('Could not save your acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!loginBrandingReady) {
    return (
      <Box className="kb-login-host min-h-screen flex items-center justify-center">
        <Loader />
      </Box>
    );
  }

  return (
    <Box
      className={[
        'kb-login-host',
        'kb-privacy-acceptance-host',
        isPwa ? 'kb-login-host--pwa' : '',
        isMobile ? 'kb-privacy-acceptance-host--mobile' : 'kb-privacy-acceptance-host--desktop',
      ]
        .filter(Boolean)
        .join(' ')}
      style={pageBgStyle}
    >
      <Card
        {...(isFullscreen ? {} : { shadow: 'lg' as const })}
        padding={isMobile ? 0 : 'xl'}
        radius={isMobile ? 0 : 'md'}
        withBorder={false}
        className={[
          'kb-privacy-acceptance-panel',
          isMobile ? 'kb-privacy-acceptance-panel--mobile' : 'kb-privacy-acceptance-panel--desktop',
        ]
          .filter(Boolean)
          .join(' ')}
        styles={{
          root: {
            backgroundColor:
              isMobile || isFullscreen ? 'transparent' : cardBg,
            ...(isFullscreen || isMobile
              ? { boxShadow: 'none', borderWidth: 0 }
              : { border: 'none' }),
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            maxHeight: '100%',
            overflow: 'hidden',
            ...(isMobile
              ? { flex: '1 1 auto', height: '100%' }
              : { flex: '1 1 auto', height: '100%' }),
          },
        }}
      >
        <Stack
          gap={isMobile ? 0 : 'sm'}
          className={[
            'kb-privacy-acceptance__stack',
            isMobile ? 'kb-privacy-acceptance__stack--mobile' : 'kb-privacy-acceptance__stack--desktop',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Box className="kb-privacy-acceptance__header">
            <Title order={2} ta="center" style={{ color: inputTitleColor }}>
              Privacy Notice
            </Title>
            <Text size="sm" ta="center" style={{ color: inputTitleColor }}>
              Please read and accept the privacy notice before continuing.
            </Text>
          </Box>
          {loadError ? (
            <Alert color="red" className="kb-privacy-acceptance__status">
              {loadError}
            </Alert>
          ) : html === null ? (
            <Text size="sm" c="dimmed" ta="center" className="kb-privacy-acceptance__status">
              Loading privacy notice…
            </Text>
          ) : (
            <ScrollArea
              className="kb-privacy-acceptance__scroll"
              offsetScrollbars
              type="auto"
              {...(isMobile
                ? {}
                : {
                    styles: {
                      root: { height: '100%', minHeight: 0 },
                      viewport: { height: '100%' },
                    },
                  })}
            >
              <Box
                className="kb-privacy-policy-content"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </ScrollArea>
          )}
          <Box className="kb-privacy-acceptance__actions">
            <Text size="sm" ta="center">
              <Anchor
                component={Link}
                to="/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: linkTitleColor }}
              >
                Open full privacy notice
              </Anchor>
            </Text>
            <Checkbox
              checked={agreed}
              onChange={(event) => setAgreed(event.currentTarget.checked)}
              label="I have read and agree to the Privacy Notice"
              styles={{
                root: { alignItems: 'center' },
                inner: { flexShrink: 0 },
                label: { color: inputTitleColor },
              }}
            />
            {submitError ? <Alert color="red">{submitError}</Alert> : null}
            <Button
              fullWidth
              disabled={!agreed || html === null || loadError !== null}
              loading={submitting}
              styles={signInButtonStyles}
              onClick={() => void handleAccept()}
            >
              Accept &amp; Continue
            </Button>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}
