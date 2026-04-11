import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { Menu, Avatar, Divider, Text, UnstyledButton, Group } from '@mantine/core';
import type { AvatarProps, TextProps } from '@mantine/core';
import { APP_USER_AVATAR_SIZE } from '../constants/userAvatar.js';
import { useAuthContext } from '../contexts/AuthContext.js';
import { userMenuStyleAvatarInitials } from '../utils/userMenuStyleAvatarInitials.js';
import { ProfileSettingsModal } from './ProfileSettingsModal.js';
import './UserMenu.css';

export interface UserMenuProps {
  /** Show display name next to avatar; both open the account menu. */
  showDisplayName?: boolean;
  /** When set, passed to `Text` `visibleFrom` (omit = always show the name). */
  nameVisibleFrom?: TextProps['visibleFrom'];
  /** Class name for the display name (e.g. home-page__user-name, board-page__user-name). */
  nameClassName?: string;
  /** Optional inline styles for the display name (e.g. app branding text colour on the home nav). */
  nameStyle?: CSSProperties;
  /** Omit both for Mantine defaults (original homepage avatar look). */
  avatarSize?: AvatarProps['size'];
  avatarColor?: AvatarProps['color'];
  /** Extra left margin on the trigger (e.g. board header spacing). */
  triggerMl?: number | string;
  /** Hover / focus ring styling for the nav surface (home = light bar, board = blue bar). */
  triggerVariant?: 'light' | 'board';
  /** Dropdown placement relative to the trigger @default 'bottom' (centered under the control). */
  menuPosition?: 'bottom' | 'bottom-start' | 'bottom-end';
}

export function UserMenu({
  showDisplayName = false,
  nameVisibleFrom,
  nameClassName,
  nameStyle,
  avatarSize,
  avatarColor,
  triggerMl,
  triggerVariant = 'light',
  menuPosition = 'bottom',
}: UserMenuProps) {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      navigate('/login');
    }
  };

  if (!user) {
    return null;
  }

  const initials = userMenuStyleAvatarInitials(user.displayName, user.username);

  const triggerClass =
    triggerVariant === 'board'
      ? 'user-menu__trigger user-menu__trigger--board'
      : 'user-menu__trigger user-menu__trigger--light';

  return (
    <>
    <ProfileSettingsModal
      opened={profileSettingsOpen}
      onClose={() => setProfileSettingsOpen(false)}
    />
    <Menu
      position={menuPosition}
      offset={8}
      shadow="md"
      closeOnItemClick
      closeOnClickOutside
      closeOnEscape
      styles={{
        dropdown: {
          minWidth: 200,
          width: 'max-content',
          maxWidth: 'min(calc(100vw - 24px), 28rem)',
        },
      }}
    >
      <Menu.Target>
        <UnstyledButton
          type="button"
          className={triggerClass}
          aria-label="Account menu"
          aria-haspopup="menu"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: triggerMl ?? undefined,
          }}
        >
          <Group gap={8} wrap="nowrap" align="center">
            <Avatar
              {...(user.profilePicture != null && user.profilePicture !== ''
                ? { src: user.profilePicture }
                : {})}
              size={avatarSize ?? APP_USER_AVATAR_SIZE}
              {...(avatarColor !== undefined ? { color: avatarColor } : {})}
            >
              {initials}
            </Avatar>
            {showDisplayName ? (
              <Text
                component="span"
                {...(nameClassName !== undefined ? { className: nameClassName } : { fw: 500 })}
                {...(nameVisibleFrom !== undefined ? { visibleFrom: nameVisibleFrom } : {})}
                {...(nameStyle !== undefined ? { style: nameStyle } : {})}
              >
                {user.displayName}
              </Text>
            ) : null}
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          <Text fw={500} style={{ wordBreak: 'break-word' }}>
            {user.displayName}
          </Text>
          <Text
            size="xs"
            c="dimmed"
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {user.email}
          </Text>
        </Menu.Label>
        <Menu.Item onClick={() => setProfileSettingsOpen(true)}>Profile</Menu.Item>
        {user.isAppAdmin === true ? (
          <Menu.Item
            onClick={() => {
              navigate('/admin/configuration');
            }}
          >
            Admin Settings
          </Menu.Item>
        ) : null}
        <Divider />
        <Menu.Item color="red" onClick={handleLogout}>
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
    </>
  );
}
