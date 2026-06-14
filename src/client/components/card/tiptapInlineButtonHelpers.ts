const MOBILE_BREAKPOINT = 768;
const DOT_SIZE_MOBILE = 16;
const DOT_SIZE_DESKTOP = 9;
const DOT_POS_MOBILE = '-8px';
const DOT_POS_DESKTOP = '-4px';
export const BORDER_COLOR = '#6C6C6C';
/** Max absolute offset when dragging the inline button (px). */
const OFFSET_CLAMP = 800;

export function isMobile(): boolean {
  return document.documentElement.clientWidth < MOBILE_BREAKPOINT;
}

/** Dismiss the virtual keyboard when interacting with non-text editor chrome on mobile/PWA. */
export function dismissCardDescriptionEditorKeyboardOnMobile(
  editorDom?: HTMLElement | null,
): void {
  if (!isMobile()) {
    return;
  }
  if (editorDom instanceof HTMLElement) {
    editorDom.blur();
  }
  const focused = document.querySelector('.ProseMirror-focused');
  if (focused instanceof HTMLElement) {
    focused.blur();
  }
}

function getDotPosition(): string {
  return isMobile() ? DOT_POS_MOBILE : DOT_POS_DESKTOP;
}

function getDotSize(): number {
  return isMobile() ? DOT_SIZE_MOBILE : DOT_SIZE_DESKTOP;
}

export function clampWidth(
  width: number,
  limits: { minWidth?: number; maxWidth?: number }
): number {
  const min = limits.minWidth !== undefined ? Math.max(0, limits.minWidth) : 0;
  let w = Math.max(min, width);
  if (limits.maxWidth !== undefined && w > limits.maxWidth) {
    w = limits.maxWidth;
  }
  return w;
}

export function normalizeWidthPx(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `${Math.round(value)}px`;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const match = /^([0-9]+(?:\.[0-9]+)?)(px)?$/i.exec(trimmed);
  if (match == null) {
    return undefined;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return `${Math.round(parsed)}px`;
}

export function extractWidthFromStyle(style: string): string | null {
  const m = style.match(/width:\s*([0-9.]+)px/);
  return m ? m[1] : null;
}

export function clearContainerBorder(container: HTMLElement): void {
  const s = container.getAttribute('style');
  if (s == null) {
    return;
  }
  const next = s
    .replace(/border:\s*1px dashed #6C6C6C;?/gi, '')
    .replace(/border:\s*1px dashed rgb\(108,\s*108,\s*108\);?/gi, '');
  container.setAttribute('style', next);
}

export function removeResizeElements(container: HTMLElement): void {
  if (container.childElementCount > 3) {
    for (let i = 0; i < 5; i++) {
      const last = container.lastChild;
      if (last) {
        container.removeChild(last);
      }
    }
  }
}

export function getContainerStyle(inline: boolean, width: string | undefined): string {
  const base = `width: ${width || '100%'}; max-width: 100%; height: auto; cursor: pointer; box-sizing: border-box;`;
  return inline ? `${base} display: inline-block;` : base;
}

export function getWrapperStyle(inline: boolean): string {
  return inline
    ? 'display: inline-block; float: left; padding-right: 8px;'
    : 'display: flex; justify-content: flex-start;';
}

export function clampOffset(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(-OFFSET_CLAMP, Math.min(OFFSET_CLAMP, Math.round(n)));
}

export function stripTransformFromStyle(style: string): string {
  return style
    .replace(/\s*transform:\s*[^;]+;?/gi, '')
    .replace(/;\s*;/g, ';')
    .replace(/^\s*;\s*|\s*;\s*$/g, '')
    .trim();
}

export function parseTranslatePx(style: string): { x: number; y: number } {
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/i.exec(style);
  if (m) {
    return { x: Number(m[1]), y: Number(m[2]) };
  }
  return { x: 0, y: 0 };
}

export function buildWrapperStyleWithOffsets(
  baseWrapperStyle: string,
  offsetXPx: number,
  offsetYPx: number
): string {
  const bx = clampOffset(offsetXPx);
  const by = clampOffset(offsetYPx);
  let stripped = stripTransformFromStyle(baseWrapperStyle).replace(/\s+/g, ' ').trim();
  if (stripped.endsWith(';')) {
    stripped = stripped.slice(0, -1).trim();
  }
  if (bx === 0 && by === 0) {
    return stripped;
  }
  const transform = `transform: translate(${bx}px, ${by}px)`;
  return stripped === '' ? transform : `${stripped}; ${transform}`;
}

export function readOffsetAttrs(attrs: Record<string, unknown>): { x: number; y: number } {
  const ox = attrs.offsetXPx;
  const oy = attrs.offsetYPx;
  return {
    x: typeof ox === 'number' && Number.isFinite(ox) ? clampOffset(ox) : 0,
    y: typeof oy === 'number' && Number.isFinite(oy) ? clampOffset(oy) : 0,
  };
}

export function getDotStyle(index: number): string {
  const dp = getDotPosition();
  const ds = getDotSize();
  const positions = [
    `top: ${dp}; left: ${dp}; cursor: nwse-resize;`,
    `top: ${dp}; right: ${dp}; cursor: nesw-resize;`,
    `bottom: ${dp}; left: ${dp}; cursor: nesw-resize;`,
    `bottom: ${dp}; right: ${dp}; cursor: nwse-resize;`,
  ];
  return `position: absolute; width: ${ds}px; height: ${ds}px; border: 1.5px solid ${BORDER_COLOR}; border-radius: 50%; ${positions[index]}`;
}

export function applyButtonVisuals(anchor: HTMLAnchorElement, attrs: Record<string, unknown>): void {
  const href = typeof attrs.href === 'string' ? attrs.href : '#';
  const buttonText = typeof attrs.buttonText === 'string' ? attrs.buttonText : 'Button';
  const textColor = typeof attrs.textColor === 'string' ? attrs.textColor : '#579DFF';
  const bgColor = typeof attrs.bgColor === 'string' ? attrs.bgColor : '#1D2125';
  const borderRadiusPx =
    typeof attrs.borderRadiusPx === 'number' && Number.isFinite(attrs.borderRadiusPx)
      ? attrs.borderRadiusPx
      : 4;
  const iconSrc = typeof attrs.iconSrc === 'string' && attrs.iconSrc.trim() !== '' ? attrs.iconSrc : '';
  const iconSizePx =
    typeof attrs.iconSizePx === 'number' && Number.isFinite(attrs.iconSizePx) ? attrs.iconSizePx : 16;
  const explicitWidth = normalizeWidthPx(attrs.width);

  anchor.setAttribute('href', href);
  anchor.setAttribute('class', 'card-desc-inline-button');
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
  anchor.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'justify-content: center',
    'gap: 8px',
    'box-sizing: border-box',
    `width: ${explicitWidth ?? '320px'}`,
    'padding: 8px 14px',
    'text-decoration: none',
    `color: ${textColor}`,
    `background-color: ${bgColor}`,
    `border-radius: ${borderRadiusPx}px`,
    'font-size: var(--mantine-font-size-sm)',
    'font-weight: 500',
    'line-height: 1.2',
  ].join('; ');

  anchor.replaceChildren();
  if (iconSrc) {
    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = '';
    img.width = iconSizePx;
    img.height = iconSizePx;
    img.style.objectFit = 'contain';
    img.style.flexShrink = '0';
    anchor.appendChild(img);
  }
  const span = document.createElement('span');
  span.className = 'card-desc-inline-button__text';
  span.textContent = buttonText;
  anchor.appendChild(span);
}
