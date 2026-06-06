import { memo, type ChangeEvent, type RefObject } from 'react';
import {
  Card,
  Checkbox,
  ColorInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { type HomepageBackgroundMode } from '../../../../shared/types/appBranding.js';
import {
  BG_MODE_SEGMENTS,
  NAV_ICON_SIZE_SELECT_DATA,
  type AppBrandingHandlers,
} from './helpers.js';
import { ImageUploadField } from './ImageUploadField.js';

interface HomeNavIconCardProps {
  readonly iconUrl: string | undefined;
  readonly iconSizePx: number;
  readonly useLoginFavicon: boolean;
  readonly handlers: AppBrandingHandlers;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClear: () => void;
}

export const HomeNavIconCard = memo(function HomeNavIconCard({
  iconUrl,
  iconSizePx,
  useLoginFavicon,
  handlers,
  inputRef,
  onFileChange,
  onPickClick,
  onClear,
}: HomeNavIconCardProps) {
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
        <ImageUploadField
          hasImage={has}
          imageUrl={iconUrl}
          previewSize={{ width: 96, height: 96 }}
          fit="contain"
          inputRef={inputRef}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          uploadLabel="Upload"
          replaceLabel="Replace"
          onFileChange={onFileChange}
          onPickClick={onPickClick}
          onClear={onClear}
          clearAriaLabel="Remove icon"
        />
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

interface HomeNavLabelCardProps {
  readonly inherit: boolean;
  readonly label: string;
  readonly handlers: AppBrandingHandlers;
  readonly disabledInput: boolean;
}

export const HomeNavLabelCard = memo(function HomeNavLabelCard({
  inherit,
  label,
  handlers,
  disabledInput,
}: HomeNavLabelCardProps) {
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

interface HomeNavTextColorCardProps {
  readonly color: string;
  readonly handlers: AppBrandingHandlers;
}

export const HomeNavTextColorCard = memo(function HomeNavTextColorCard({
  color,
  handlers,
}: HomeNavTextColorCardProps) {
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

interface HomeNavBarColorCardProps {
  readonly color: string;
  readonly handlers: AppBrandingHandlers;
}

export const HomeNavBarColorCard = memo(function HomeNavBarColorCard({
  color,
  handlers,
}: HomeNavBarColorCardProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage navbar colour</Title>
        <ColorInput label="Navbar background" value={color} onChange={handlers.setHomepageNavbarColor} />
      </Stack>
    </Card>
  );
});

interface HomeBackgroundCardProps {
  readonly mode: HomepageBackgroundMode;
  readonly backgroundColor: string;
  readonly imageUrl: string | undefined;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClearImage: () => void;
  readonly handlers: AppBrandingHandlers;
}

export const HomeBackgroundCard = memo(function HomeBackgroundCard({
  mode,
  backgroundColor,
  imageUrl,
  inputRef,
  onFileChange,
  onPickClick,
  onClearImage,
  handlers,
}: HomeBackgroundCardProps) {
  const hasImg = Boolean(imageUrl?.trim());
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Homepage background colour / image</Title>
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) => handlers.setHomepageBackgroundMode(v === 'image' ? 'image' : 'color')}
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
            <ImageUploadField
              hasImage={hasImg}
              imageUrl={imageUrl}
              previewSize={{ width: 160, height: 96 }}
              fit="cover"
              inputRef={inputRef}
              accept="image/png,image/jpeg,image/webp"
              uploadLabel="Upload image"
              replaceLabel="Replace image"
              onFileChange={onFileChange}
              onPickClick={onPickClick}
              onClear={onClearImage}
              clearAriaLabel="Remove background image"
            />
          </Stack>
        )}
      </Stack>
    </Card>
  );
});

interface BoardNavIconCardProps {
  readonly sameAsHome: boolean;
  readonly iconUrl: string | undefined;
  readonly iconSizePx: number;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClear: () => void;
  readonly handlers: AppBrandingHandlers;
}

export const BoardNavIconCard = memo(function BoardNavIconCard({
  sameAsHome,
  iconUrl,
  iconSizePx,
  inputRef,
  onFileChange,
  onPickClick,
  onClear,
  handlers,
}: BoardNavIconCardProps) {
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
        <ImageUploadField
          hasImage={has && !sameAsHome}
          imageUrl={iconUrl}
          previewSize={{ width: 96, height: 96 }}
          fit="contain"
          inputRef={inputRef}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          uploadLabel="Upload"
          replaceLabel="Replace"
          onFileChange={onFileChange}
          onPickClick={onPickClick}
          onClear={onClear}
          disabled={sameAsHome}
          clearAriaLabel="Remove board icon"
        />
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
