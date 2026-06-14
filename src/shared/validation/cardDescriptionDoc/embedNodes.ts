import { parseTwemojiSpriteCoord } from '../../twemojiSpriteCoord.js';
import {
  isAbsentOrEmptyLeafContent,
  isAllowedTextStyleColor,
  isRecord,
  isSafeInlineStyleString,
  validateHref,
  validateInlineButtonIconSrc,
  validateMediaSrc,
} from './primitives.js';

export function validateMediaBlockNode(
  type: 'image' | 'imageResize' | 'video' | 'audio',
  node: Record<string, unknown>,
): boolean {
  const attrs = node.attrs;
  if (!isRecord(attrs)) {
    return false;
  }
  if (!validateMediaSrc(attrs.src)) {
    return false;
  }
  if (type === 'video') {
    const poster = attrs.poster;
    if (poster !== undefined && poster !== null && poster !== '') {
      if (typeof poster !== 'string' || !validateMediaSrc(poster)) {
        return false;
      }
    }
  }
  if (type === 'audio') {
    const width = attrs.width;
    if (width !== null && width !== undefined) {
      if (typeof width !== 'string' || !/^[0-9]{1,4}$/.test(width.trim())) {
        return false;
      }
    }
    const height = attrs.height;
    if (height !== null && height !== undefined) {
      if (typeof height !== 'string' || !/^[0-9]{1,4}$/.test(height.trim())) {
        return false;
      }
    }
    const displayTitle = attrs.displayTitle;
    if (displayTitle !== null && displayTitle !== undefined) {
      if (typeof displayTitle !== 'string' || displayTitle.length > 200) {
        return false;
      }
    }
    const displayDescription = attrs.displayDescription;
    if (displayDescription !== null && displayDescription !== undefined) {
      if (typeof displayDescription !== 'string' || displayDescription.length > 500) {
        return false;
      }
    }
    const coverSrc = attrs.coverSrc;
    if (coverSrc !== null && coverSrc !== undefined && coverSrc !== '') {
      if (typeof coverSrc !== 'string' || !validateInlineButtonIconSrc(coverSrc)) {
        return false;
      }
    }
    if (!isSafeInlineStyleString(attrs.containerStyle)) {
      return false;
    }
    const textColor = attrs.textColor;
    if (textColor !== null && textColor !== undefined && textColor !== '') {
      if (!isAllowedTextStyleColor(textColor)) {
        return false;
      }
    }
    const bgColor = attrs.bgColor;
    if (bgColor !== null && bgColor !== undefined && bgColor !== '') {
      if (!isAllowedTextStyleColor(bgColor)) {
        return false;
      }
    }
    const buttonHoverColor = attrs.buttonHoverColor;
    if (buttonHoverColor !== null && buttonHoverColor !== undefined && buttonHoverColor !== '') {
      if (!isAllowedTextStyleColor(buttonHoverColor)) {
        return false;
      }
    }
  }
  if (!isAbsentOrEmptyLeafContent(node.content)) {
    return false;
  }
  return true;
}

export function validateInlineButtonNode(node: Record<string, unknown>): boolean {
  const attrs = node.attrs;
  if (!isRecord(attrs)) {
    return false;
  }
  if (!validateHref(attrs.href)) {
    return false;
  }
  const buttonText = attrs.buttonText;
  if (typeof buttonText !== 'string' || buttonText.length > 500) {
    return false;
  }
  if (!isAllowedTextStyleColor(attrs.textColor) || !isAllowedTextStyleColor(attrs.bgColor)) {
    return false;
  }
  const br = attrs.borderRadiusPx;
  if (
    typeof br !== 'number' ||
    !Number.isInteger(br) ||
    br < 0 ||
    br > 48
  ) {
    return false;
  }
  const isp = attrs.iconSizePx;
  if (
    typeof isp !== 'number' ||
    !Number.isInteger(isp) ||
    isp < 8 ||
    isp > 128
  ) {
    return false;
  }
  const iconSrc = attrs.iconSrc;
  if (iconSrc !== null && iconSrc !== undefined) {
    if (typeof iconSrc !== 'string' || !validateInlineButtonIconSrc(iconSrc)) {
      return false;
    }
  }
  const width = attrs.width;
  if (width !== null && width !== undefined) {
    if (typeof width !== 'string' || !/^[0-9]{1,4}$/.test(width.trim())) {
      return false;
    }
  }
  if (!isSafeInlineStyleString(attrs.containerStyle) || !isSafeInlineStyleString(attrs.wrapperStyle)) {
    return false;
  }
  const ox = attrs.offsetXPx;
  const oy = attrs.offsetYPx;
  if (ox !== undefined) {
    if (typeof ox !== 'number' || !Number.isInteger(ox) || ox < -800 || ox > 800) {
      return false;
    }
  }
  if (oy !== undefined) {
    if (typeof oy !== 'number' || !Number.isInteger(oy) || oy < -800 || oy > 800) {
      return false;
    }
  }
  if (!isAbsentOrEmptyLeafContent(node.content)) {
    return false;
  }
  return true;
}

export function validateTwemojiNode(node: Record<string, unknown>): boolean {
  const attrs = node.attrs;
  if (!isRecord(attrs)) {
    return false;
  }
  if (typeof attrs.emoji !== 'string' || attrs.emoji.trim() === '') {
    return false;
  }
  if (!isAbsentOrEmptyLeafContent(node.content)) {
    return false;
  }
  const sx = parseTwemojiSpriteCoord(attrs.spriteX);
  const sy = parseTwemojiSpriteCoord(attrs.spriteY);
  const hasSprite =
    sx != null &&
    sy != null &&
    sx >= 0 &&
    sy >= 0 &&
    sx < 512 &&
    sy < 512;
  if (hasSprite) {
    return true;
  }
  if (!validateMediaSrc(attrs.src)) {
    return false;
  }
  return true;
}
