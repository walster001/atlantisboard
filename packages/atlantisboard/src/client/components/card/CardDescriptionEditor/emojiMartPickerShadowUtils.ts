export function getEmojiMartShadow(rootEl: HTMLElement): ShadowRoot | null {
  const host = rootEl.querySelector('em-emoji-picker');
  return host?.shadowRoot ?? null;
}

export function resolveEmojiMartScrollRoot(rootEl: HTMLElement): HTMLElement | null {
  const scroll = getEmojiMartShadow(rootEl)?.querySelector('.scroll');
  return scroll instanceof HTMLElement ? scroll : null;
}

export function resolveEmojiMartScrollTargets(rootEl: HTMLElement): readonly HTMLElement[] {
  const targets: HTMLElement[] = [rootEl];
  const host = rootEl.querySelector('em-emoji-picker');
  if (host instanceof HTMLElement) {
    targets.push(host);
  }
  const scroll = resolveEmojiMartScrollRoot(rootEl);
  if (scroll != null) {
    targets.push(scroll);
  }
  return targets;
}
