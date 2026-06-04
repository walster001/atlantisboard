import { memo, type CSSProperties } from 'react';
import { Box, Text, Group } from '@mantine/core';
import {
  IconArrowLeft,
  IconLayoutKanbanFilled,
  IconLink,
  IconSettings,
} from '@tabler/icons-react';
import type { PublicLoginBranding } from '../../../shared/types/loginBranding.js';
import {
  type PublicAppBranding,
  resolveBoardNavbarIconUrl,
  resolveHomepageNavbarIconUrl,
  resolveHomepageNavbarLabelText,
} from '../../../shared/types/appBranding.js';
import './appBrandingPreviewPane.css';

export const AppBrandingPreviewPane = memo(function AppBrandingPreviewPane({
  app,
  login,
}: {
  readonly app: PublicAppBranding;
  readonly login: PublicLoginBranding;
}) {
  const label = resolveHomepageNavbarLabelText(app, login);
  const homeIconUrl = resolveHomepageNavbarIconUrl(app, login);

  const boardIconUrl = resolveBoardNavbarIconUrl(app, login);

  const pageBgStyle: CSSProperties =
    app.homepageBackgroundMode === 'image' && app.homepageBackgroundImageUrl?.trim()
      ? {
          backgroundImage: `url(${app.homepageBackgroundImageUrl.trim()})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: app.homepageBackgroundColor,
        }
      : { backgroundColor: app.homepageBackgroundColor };

  const labelStyle: CSSProperties = {
    color: app.homepageNavbarTextColor,
  };

  const userNameStyle: CSSProperties = { color: app.homepageNavbarTextColor };

  return (
    <Box>
      <Text fw={600} size="sm" mb="sm">
        Live preview
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Boards homepage navbar (top) and a board-style navbar (below). Updates shortly after you
        stop typing.
      </Text>
      <Box className="app-branding-preview__frame" style={pageBgStyle}>
        <Text size="xs" c="dimmed" px="md" pt="sm">
          Boards homepage navbar
        </Text>
        <Box className="app-branding-preview__home-nav" style={{ backgroundColor: app.homepageNavbarColor }}>
          <Box className="app-branding-preview__home-nav-inner">
            <Group gap="xs" wrap="nowrap" align="center">
              {homeIconUrl ? (
                <img
                  src={homeIconUrl}
                  alt=""
                  width={app.homepageNavbarIconSizePx}
                  height={app.homepageNavbarIconSizePx}
                  className="app-branding-preview__brand-icon"
                />
              ) : (
                <IconLayoutKanbanFilled
                  size={app.homepageNavbarIconSizePx}
                  color="var(--mantine-color-blue-6)"
                  aria-hidden
                />
              )}
              <span className="app-branding-preview__brand-label" style={labelStyle}>
                {label}
              </span>
            </Group>
            <span className="app-branding-preview__mock-user" style={userNameStyle}>
              <span className="app-branding-preview__mock-avatar" aria-hidden />
              Jane Doe
            </span>
          </Box>
        </Box>

        <Box className="app-branding-preview__board-wrap">
          <Text size="xs" c="dimmed" mb={6}>
            Board example navbar
          </Text>
          <Box className="app-branding-preview__board-nav">
            <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <span className="app-branding-preview__board-icon-btn" aria-hidden>
                <IconArrowLeft size={22} stroke={1.75} />
              </span>
              <span className="app-branding-preview__board-icon-btn" aria-hidden>
                {boardIconUrl ? (
                  <img
                    src={boardIconUrl}
                    alt=""
                    width={app.boardNavbarIconSizePx}
                    height={app.boardNavbarIconSizePx}
                    className="app-branding-preview__board-custom-icon"
                  />
                ) : (
                  <IconLayoutKanbanFilled size={app.boardNavbarIconSizePx} aria-hidden />
                )}
              </span>
              <span className="app-branding-preview__board-title">Sample board</span>
            </Group>
            <Group gap={4} wrap="nowrap" className="app-branding-preview__board-actions">
              <span className="app-branding-preview__board-icon-btn" aria-hidden>
                <span style={{ display: 'inline-flex', transform: 'rotate(45deg)' }}>
                  <IconLink size={19} stroke={1.5} />
                </span>
              </span>
              <span className="app-branding-preview__board-icon-btn" aria-hidden>
                <IconSettings size={20} stroke={1.9} />
              </span>
              <span className="app-branding-preview__mock-user" style={{ color: '#fff' }}>
                <span className="app-branding-preview__mock-avatar" aria-hidden />
                Jane
              </span>
            </Group>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
