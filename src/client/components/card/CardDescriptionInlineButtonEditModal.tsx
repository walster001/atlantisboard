import { useLayoutEffect, useState, type ReactElement } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconExternalLink, IconTrash, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { DEFAULT_INLINE_BUTTON_ATTRS } from './tiptapInlineButtonExtension.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../../constants/iosModalSafeArea.js';
import './cardInlineButtonEditModal.css';

const RADIUS_OPTIONS = ['0', '4', '8', '12', '16', '20'] as const;

type InlineButtonDraft = {
  readonly href: string;
  readonly buttonText: string;
  readonly textColor: string;
  readonly bgColor: string;
  readonly borderRadiusPx: string;
  readonly iconSizePx: string;
  readonly iconSrc: string | null;
};

function readInlineButtonDraft(editor: Editor, nodePos: number): InlineButtonDraft | null {
  const node = editor.state.doc.nodeAt(nodePos);
  if (node == null || node.type.name !== 'inlineButton') {
    return null;
  }
  const a = node.attrs as {
    href?: string;
    buttonText?: string;
    textColor?: string;
    bgColor?: string;
    borderRadiusPx?: number;
    iconSizePx?: number;
    iconSrc?: string | null;
  };
  return {
    href: typeof a.href === 'string' ? a.href : '',
    buttonText: typeof a.buttonText === 'string' ? a.buttonText : '',
    textColor: typeof a.textColor === 'string' ? a.textColor : DEFAULT_INLINE_BUTTON_ATTRS.textColor,
    bgColor: typeof a.bgColor === 'string' ? a.bgColor : DEFAULT_INLINE_BUTTON_ATTRS.bgColor,
    borderRadiusPx:
      typeof a.borderRadiusPx === 'number' && Number.isFinite(a.borderRadiusPx)
        ? String(a.borderRadiusPx)
        : String(DEFAULT_INLINE_BUTTON_ATTRS.borderRadiusPx),
    iconSizePx:
      typeof a.iconSizePx === 'number' && Number.isFinite(a.iconSizePx)
        ? String(a.iconSizePx)
        : String(DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx),
    iconSrc: typeof a.iconSrc === 'string' && a.iconSrc.trim() !== '' ? a.iconSrc : null,
  };
}

function isAllowedHref(href: string): boolean {
  const t = href.trim();
  if (t.length === 0 || t.length > 2048) {
    return false;
  }
  return (
    t.startsWith('https://') ||
    t.startsWith('http://') ||
    t.startsWith('/') ||
    t.startsWith('#') ||
    t.startsWith('mailto:')
  );
}

export interface CardDescriptionInlineButtonEditModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly editor: Editor;
  readonly nodePos: number | null;
  readonly cardId: string;
}

export function CardDescriptionInlineButtonEditModal({
  opened,
  onClose,
  editor,
  nodePos,
  cardId,
}: CardDescriptionInlineButtonEditModalProps): ReactElement {
  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const draft = nodePos != null ? readInlineButtonDraft(editor, nodePos) : null;

  const [href, setHref] = useState(() => draft?.href ?? '');
  const [buttonText, setButtonText] = useState(() => draft?.buttonText ?? '');
  const [textColor, setTextColor] = useState(() => draft?.textColor ?? DEFAULT_INLINE_BUTTON_ATTRS.textColor);
  const [bgColor, setBgColor] = useState(() => draft?.bgColor ?? DEFAULT_INLINE_BUTTON_ATTRS.bgColor);
  const [borderRadiusPx, setBorderRadiusPx] = useState(
    () => draft?.borderRadiusPx ?? String(DEFAULT_INLINE_BUTTON_ATTRS.borderRadiusPx),
  );
  const [iconSizePx, setIconSizePx] = useState(
    () => draft?.iconSizePx ?? String(DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx),
  );
  const [iconSrc, setIconSrc] = useState<string | null>(() => draft?.iconSrc ?? null);
  const [iconUploadBusy, setIconUploadBusy] = useState(false);

  useLayoutEffect(() => {
    if (!opened || nodePos == null) {
      return;
    }
    if (readInlineButtonDraft(editor, nodePos) == null) {
      onClose();
    }
  }, [opened, nodePos, editor, onClose]);

  const uploadIcon = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      setIconUploadBusy(true);
      try {
        const response = await api.uploadCardAttachment(cardId, file);
        const attachmentId = (response as { attachment?: { id?: unknown } }).attachment?.id;
        if (typeof attachmentId !== 'string' || attachmentId.trim() === '') {
          throw new Error('Upload succeeded but attachment id was missing.');
        }
        setIconSrc(api.getAttachmentFileUrl(attachmentId));
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Upload failed',
          message: error instanceof Error ? error.message : 'Could not upload icon.',
        });
      }
      setIconUploadBusy(false);
    };
    input.click();
  };

  const handleSave = (): void => {
    if (nodePos == null) {
      return;
    }
    const h = href.trim();
    if (!isAllowedHref(h)) {
      notifications.show({
        color: 'red',
        title: 'Invalid link',
        message: 'Enter a valid URL (https, http, mailto, or path).',
      });
      return;
    }
    const label = buttonText.trim();
    if (label.length === 0 || label.length > 500) {
      notifications.show({
        color: 'red',
        title: 'Invalid label',
        message: 'Button text is required (max 500 characters).',
      });
      return;
    }
    const br = Number.parseInt(borderRadiusPx, 10);
    const isp = Number.parseInt(iconSizePx, 10);
    if (!Number.isFinite(br) || br < 0 || br > 48) {
      return;
    }
    if (!Number.isFinite(isp) || isp < 8 || isp > 128) {
      return;
    }

    const { state } = editor;
    const node = state.doc.nodeAt(nodePos);
    if (node == null || node.type.name !== 'inlineButton') {
      onClose();
      return;
    }

    const next = {
      ...node.attrs,
      href: h,
      buttonText: label,
      textColor,
      bgColor,
      borderRadiusPx: br,
      iconSizePx: isp,
      iconSrc: iconSrc != null && iconSrc.trim() !== '' ? iconSrc.trim() : null,
    };
    editor.view.dispatch(state.tr.setNodeMarkup(nodePos, undefined, next));
    onClose();
  };

  const handleDelete = (): void => {
    if (nodePos == null) {
      return;
    }
    const { state } = editor;
    const node = state.doc.nodeAt(nodePos);
    if (node == null || node.type.name !== 'inlineButton') {
      onClose();
      return;
    }
    const tr = state.tr.delete(nodePos, nodePos + node.nodeSize);
    editor.view.dispatch(tr);
    onClose();
  };

  const brNum = Number.parseInt(borderRadiusPx, 10);
  const ispNum = Number.parseInt(iconSizePx, 10);
  const previewRadius = Number.isFinite(brNum) ? brNum : DEFAULT_INLINE_BUTTON_ATTRS.borderRadiusPx;
  const previewIconSize = Number.isFinite(ispNum) ? ispNum : DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx;

  const formFields = (
    <>
      <div>
        <Text size="sm" fw={500} mb={6}>
          Preview
        </Text>
        <Box
          p="md"
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-gray-3)',
            backgroundColor: 'var(--mantine-color-gray-0)',
          }}
        >
          <Box
            component="span"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxSizing: 'border-box',
              padding: '8px 14px',
              textDecoration: 'none',
              color: textColor,
              backgroundColor: bgColor,
              borderRadius: previewRadius,
              fontSize: 'var(--mantine-font-size-sm)',
              fontWeight: 500,
              maxWidth: '100%',
            }}
          >
            {iconSrc != null && iconSrc.trim() !== '' ? (
              <img
                src={iconSrc}
                alt=""
                width={previewIconSize}
                height={previewIconSize}
                style={{ objectFit: 'contain', flexShrink: 0 }}
              />
            ) : null}
            <span>{buttonText.trim() !== '' ? buttonText : 'Button'}</span>
          </Box>
        </Box>
      </div>

      <Group align="flex-end" wrap="wrap">
        <Text size="sm" fw={500} style={{ width: '100%' }}>
          Icon
        </Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconUpload size={14} />}
          onClick={uploadIcon}
          loading={iconUploadBusy}
        >
          Change
        </Button>
        {iconSrc != null && iconSrc.trim() !== '' ? (
          <>
            <Box
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                border: '1px solid var(--mantine-color-gray-4)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--mantine-color-body)',
              }}
            >
              <img src={iconSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </Box>
            <ActionIcon
              color="red"
              variant="subtle"
              aria-label="Remove icon"
              onClick={() => setIconSrc(null)}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </>
        ) : null}
      </Group>

      <TextInput
        label="Icon size"
        value={iconSizePx}
        onChange={(e) => setIconSizePx(e.currentTarget.value)}
        inputMode="numeric"
        placeholder={String(DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx)}
        rightSection={
          <Text size="xs" c="dimmed" mr={4}>
            px
          </Text>
        }
      />

      <TextInput label="Link URL" value={href} onChange={(e) => setHref(e.currentTarget.value)} />

      <TextInput label="Button text" value={buttonText} onChange={(e) => setButtonText(e.currentTarget.value)} />

      <Group grow align="flex-start">
        <ColorInput label="Text color" value={textColor} onChange={setTextColor} format="hex" />
        <ColorInput label="Background color" value={bgColor} onChange={setBgColor} format="hex" />
      </Group>

      <Select
        label="Roundness"
        data={RADIUS_OPTIONS.map((r) => ({ value: r, label: `${r}px` }))}
        value={borderRadiusPx}
        onChange={(v) => setBorderRadiusPx(v ?? '4')}
        allowDeselect={false}
      />
    </>
  );

  const actionBar = (
    <Group
      justify={isMobile ? 'space-between' : 'flex-end'}
      align="center"
      gap="sm"
      mt={isMobile ? 0 : 'md'}
      wrap="wrap"
      {...(isMobile ? { className: 'card-inline-button-edit-modal__mobile-footer' } : {})}
    >
      <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete}>
        Delete
      </Button>
      <Group gap="sm" wrap="nowrap">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </Group>
    </Group>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen={isMobile}
      centered={!isMobile}
      transitionProps={{ duration: 0 }}
      overlayProps={{ backgroundOpacity: 0.55, blur: 0 }}
      title={
        <Group gap="xs" wrap="nowrap">
          <IconExternalLink size={20} aria-hidden />
          <Text fw={600} component="span">
            Edit inline button
          </Text>
        </Group>
      }
      size="md"
      padding="lg"
      zIndex={600}
      classNames={{
        header: KB_IOS_MODAL_HEADER_SAFE_CLASS,
        ...(isMobile
          ? {
              inner: 'card-inline-button-edit-modal__mantine-inner--mobile',
              content: 'card-inline-button-edit-modal__mantine-content--mobile',
              body: 'card-inline-button-edit-modal__mantine-body--mobile',
            }
          : {}),
      }}
      styles={modalStylesFullscreenSafeBody(isMobile)}
    >
      {isMobile ? (
        <Box className="card-inline-button-edit-modal__mobile-root">
          <Box className="card-inline-button-edit-modal__mobile-scroll">
            <Stack gap="md" pt="xs">
              {formFields}
            </Stack>
          </Box>
          {actionBar}
        </Box>
      ) : (
        <Stack gap="md" pt="xs">
          {formFields}
          {actionBar}
        </Stack>
      )}
    </Modal>
  );
}
